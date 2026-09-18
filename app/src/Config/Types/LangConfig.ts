export type LangType = "compiled" | "interpreted" | "mixed";

export type LangConfig = {
  template: string;
  command: string;
  debugCommand: string;
  type?: LangType;
  commentString?: string;
  runCommand?: string; // used for mixed languages (java, kotlin, ...)
};
