import type { TaskSkill } from "@/domain/tasks/types";
export const knowledgeSkillLabels: Record<TaskSkill, string> = {
  recognition: "Recognition",
  context: "Understanding in context",
  recall: "Active recall",
  writing: "Writing",
  speaking: "Spontaneous speech",
  listening: "Listening",
  pronunciation: "Pronunciation",
  grammar: "Grammar concepts",
};
