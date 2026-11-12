import type { CategoryModule } from "@/features/intelligence/modules/registry";

export const educationModule: CategoryModule = {
  category: "EDUCATION",
  moduleIds: ["education.enrollment", "education.requirements"],
  specializedSections: [
    {
      id: "enrollment",
      title: "Enrollment",
      guidance: "Enrollment steps, dates, and what is needed to enroll.",
    },
    {
      id: "academic-requirements",
      title: "Academic requirements",
      guidance: "Grades, units, prerequisites, and standing the student must meet.",
    },
    {
      id: "deadlines",
      title: "Deadlines",
      guidance: "Submission, payment, and registration deadlines.",
    },
  ],
  promptGuidance:
    "This is an education document. Explain enrollment, academic requirements, and deadlines. Flag any date the user must act on.",
};
