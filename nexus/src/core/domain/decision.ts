export interface Decision {
  id: number;
  title: string;
  date: string;
  context: string;
  options: string[];
  decision: string;
  rationale: string;
  consequences: string[];
}
