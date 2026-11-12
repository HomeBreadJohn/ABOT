import type { CategoryModule } from "@/features/intelligence/modules/registry";

export const medicalModule: CategoryModule = {
  category: "MEDICAL",
  moduleIds: ["medical.instructions", "medical.terminology"],
  specializedSections: [
    {
      id: "instructions",
      title: "Instructions",
      guidance: "Steps the patient is told to follow, dosages, and precautions.",
    },
    {
      id: "terminology",
      title: "Medical terminology",
      guidance: "Plain-language meaning of medical terms used in the document.",
    },
    {
      id: "appointments",
      title: "Appointments",
      guidance: "Follow-up dates, locations, and preparation.",
    },
    {
      id: "follow-up",
      title: "Follow-up questions",
      guidance: "Questions the user may want to ask a clinician.",
    },
  ],
  promptGuidance:
    "This is a medical document. Explain instructions, terminology, appointments, and follow-up questions. Do not give medical advice or diagnoses; point the user to a clinician.",
};
