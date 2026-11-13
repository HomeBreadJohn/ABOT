"use client";

import { Camera, FileText, FileUp, Images, ShieldCheck, Trash, TriangleExclamationPoint } from "lucide-react";
import { useRef, useState } from "react";

import {
  allowedMimeTypeSchema,
  MAX_DOCUMENT_SIZE_BYTES,
  type AllowedMimeType,
} from "@/contracts/common";
import {
  ApiClientError,
  completeUpload,
  registerDocument,
  uploadToSignedUrl,
} from "@/lib/api-client";

import { uid } from "../data";
import { listItemToProtoDoc } from "../adapters";
import { useStore, useToast } from "../store";
import { Btn, Callout, Panel, Screen } from "../ui";

type Picked = {
  id: string;
  name: string;
  size: number;
  type: string;
  file?: File;
  previewUrl?: string;
  error?: string;
};

function validate(file: { type: string; size: number }): string | undefined {
  if (!allowedMimeTypeSchema.safeParse(file.type).success)
    return "This file type isn't supported. Use a PDF or a JPG, PNG, TIFF or WebP photo.";
  if (file.size > MAX_DOCUMENT_SIZE_BYTES)
    return "This file is bigger than 10 MB. Try a smaller photo or split the PDF.";
  return undefined;
}

function size(bytes: number) {
  return bytes >= 1_000_000 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export function UploadScreen() {
  const { dispatch } = useStore();
  const toast = useToast();
  const [picked, setPicked] = useState<Picked[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const add = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files).map((f) => ({
      id: uid("pick"),
      name: f.name,
      size: f.size,
      type: f.type,
      file: f,
      previewUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
      error: validate(f),
    }));
    setPicked((p) => [...p, ...next]);
  };

  const valid = picked.filter((p) => !p.error && p.file);

  /** Real flow: register -> PUT to the signed URL -> complete, then poll on Processing. */
  const uploadOne = async (p: Picked): Promise<string> => {
    const file = p.file!;
    const registered = await registerDocument({
      originalFilename: p.name,
      mimeType: p.type as AllowedMimeType,
      fileSize: p.size,
    });
    await uploadToSignedUrl(registered.uploadUrl, file);
    const completed = await completeUpload(registered.documentId);
    dispatch({
      type: "addDocs",
      docs: [
        {
          ...listItemToProtoDoc({
            documentId: completed.documentId,
            title: p.name,
            lifecycle: completed.lifecycle,
            stage: "RECEIVED",
            category: null,
            analysisStatus: "NONE",
            nextDeadline: null,
            needsAttention: false,
            createdAt: new Date().toISOString(),
          }),
          previewUrl: p.previewUrl,
        },
      ],
    });
    return completed.documentId;
  };

  const start = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      let firstId: string | undefined;
      for (const p of valid) {
        const id = await uploadOne(p);
        firstId ??= id;
      }
      if (firstId)
        dispatch({ type: "go", route: { name: "processing", id: firstId }, replace: true });
    } catch (e) {
      const msg =
        e instanceof ApiClientError ? e.message : "Upload failed. Please try again.";
      toast(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const accept = allowedMimeTypeSchema.options.join(",");

  return (
    <Screen back title="Add a document" lead="Each file becomes its own document with its own report. You can add several at once.">
      <input ref={fileRef} type="file" multiple accept={accept} className="sr-only" onChange={(e) => add(e.target.files)} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => add(e.target.files)} />
      <input ref={galleryRef} type="file" multiple accept="image/*" className="sr-only" onChange={(e) => add(e.target.files)} />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: Camera, label: "Take a photo", hint: "Flat, bright, all four corners", ref: cameraRef },
          { icon: Images, label: "From your gallery", hint: "Choose one or more photos", ref: galleryRef },
          { icon: FileUp, label: "Choose a file", hint: "PDF or image, up to 10 MB", ref: fileRef },
        ].map((m) => (
          <button
            key={m.label}
            type="button"
            onClick={() => m.ref.current?.click()}
            className="lift flex items-center gap-3 rounded-2xl border border-(--line-2) bg-(--surface) p-4 text-left hover:border-(--care) sm:flex-col sm:items-start"
          >
            <span className="flex size-12 items-center justify-center rounded-xl bg-(--care-wash) text-(--care-strong)">
              <m.icon className="size-6" aria-hidden />
            </span>
            <span>
              <span className="block font-bold">{m.label}</span>
              <span className="text-sm text-(--ink-3)">{m.hint}</span>
            </span>
          </button>
        ))}
      </div>

      {picked.length > 0 ? (
        <Panel className="mt-6">
          <ul>
            {picked.map((p) => (
              <li key={p.id} className="flex items-center gap-3 border-b border-(--line) px-4 py-3 last:border-b-0">
                {p.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                  <img src={p.previewUrl} alt="" className="size-12 rounded-lg object-cover" />
                ) : (
                  <span className="flex size-12 items-center justify-center rounded-lg bg-(--canvas)">
                    <FileText className="size-6 text-(--ink-3)" aria-hidden />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.name}</p>
                  {p.error ? (
                    <p className="flex items-start gap-1 text-[0.9375rem] text-(--critical)">
                      <TriangleExclamationPoint className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {p.error}
                    </p>
                  ) : (
                    <p className="text-sm text-(--ink-3)">{size(p.size)}, ready</p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => setPicked((all) => all.filter((x) => x.id !== p.id))}
                  className="flex size-10 items-center justify-center rounded-lg text-(--ink-3) hover:bg-(--canvas)"
                >
                  <Trash className="size-5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <div className="mt-6">
        <Callout tone="care" icon={ShieldCheck} title="Only you can see your documents">
          Files are stored privately in your account. ABOT reads them to explain them. It never signs, pays,
          submits or contacts anyone for you.
        </Callout>
      </div>

      <div className="sticky bottom-20 mt-6 lg:bottom-4">
        <Btn variant="primary" size="lg" className="w-full" disabled={valid.length === 0 || submitting} onClick={start}>
          {submitting
            ? "Uploading…"
            : valid.length > 1
              ? `Explain ${valid.length} documents`
              : "Explain this document"}
        </Btn>
      </div>
    </Screen>
  );
}
