"use client";

import * as React from "react";

function containsFiles(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes("Files");
}

/**
 * Adds drag-and-drop behavior to an existing surface. Keyboard and button
 * inputs remain independent because this hook only listens for drag events.
 */
export function useDropZone(
  ref: React.RefObject<HTMLElement | null>,
  onFiles: (files: readonly File[]) => void,
): { isDragging: boolean } {
  const [isDragging, setIsDragging] = React.useState(false);
  const dragDepth = React.useRef(0);
  const onFilesRef = React.useRef(onFiles);

  React.useEffect(() => {
    onFilesRef.current = onFiles;
  }, [onFiles]);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    const handleDragEnter = (event: DragEvent) => {
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer || !containsFiles(dataTransfer)) {
        return;
      }

      event.preventDefault();
      dragDepth.current += 1;
      setIsDragging(true);
    };

    const handleDragOver = (event: DragEvent) => {
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer || !containsFiles(dataTransfer)) {
        return;
      }

      event.preventDefault();
      dataTransfer.dropEffect = "copy";
    };

    const handleDragLeave = (event: DragEvent) => {
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer || !containsFiles(dataTransfer)) {
        return;
      }

      event.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) {
        setIsDragging(false);
      }
    };

    const handleDrop = (event: DragEvent) => {
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer || !containsFiles(dataTransfer)) {
        return;
      }

      event.preventDefault();
      dragDepth.current = 0;
      setIsDragging(false);
      onFilesRef.current(Array.from(dataTransfer.files));
    };

    node.addEventListener("dragenter", handleDragEnter);
    node.addEventListener("dragover", handleDragOver);
    node.addEventListener("dragleave", handleDragLeave);
    node.addEventListener("drop", handleDrop);

    return () => {
      node.removeEventListener("dragenter", handleDragEnter);
      node.removeEventListener("dragover", handleDragOver);
      node.removeEventListener("dragleave", handleDragLeave);
      node.removeEventListener("drop", handleDrop);
      dragDepth.current = 0;
    };
  }, [ref]);

  return { isDragging };
}

export { containsFiles };
