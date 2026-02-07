import { summarizeProject } from '../../core/domain/summary.ts';
import type { TuiState } from '../state.ts';
import { renderTextView } from './textView.ts';

const DASHBOARD_TEXT_KEY = Symbol.for('nexus.tui.view.dashboard.text');

export function render(container: any, state: TuiState): void {
  const content = buildDashboardContent(state);
  renderTextView(container, DASHBOARD_TEXT_KEY, 'dashboard-view-text', content);
}

function buildDashboardContent(state: TuiState): string {
  if (!state.project) {
    return [
      'No project loaded.',
      '',
      'Press [n] to create a new project',
      'or [o] to open an existing one.',
    ].join('\n');
  }

  const { project } = state;
  const summary = summarizeProject(project);
  const lines: string[] = [];

  // Title & Status
  lines.push(`Project: ${project.projectDoc.title}`);
  lines.push(`Status: ${project.meta.status}`); // Or derived activity state? Ticket says "Status: Active". ProjectMeta has status.
  lines.push('');

  // Goals
  lines.push('Goals:');
  if (project.projectDoc.goals.length === 0) {
    lines.push('- (None)');
  } else {
    for (const goal of project.projectDoc.goals) {
      lines.push(`- ${goal}`);
    }
  }
  lines.push('');

  // Plan
  lines.push('Plan:');
  lines.push(`- Status: ${project.plan.status}`);
  if (project.plan.phases.length > 0) {
    lines.push('- Phases:');
    project.plan.phases.forEach((phase, index) => {
      lines.push(`  ${index + 1}. ${phase}`);
    });
  } else {
    lines.push('- Phases: (None)');
  }
  lines.push('');

  // Tasks
  lines.push('Tasks:');
  lines.push(`- Pending: ${summary.taskCounts.pending}`);
  lines.push(`- Running: ${summary.taskCounts.running}`);
  lines.push(`- Blocked: ${summary.taskCounts.blocked}`);
  lines.push(`- Completed: ${summary.taskCounts.completed}`);
  lines.push('');

  // Decisions
  lines.push('Decisions:');
  lines.push(`- Recorded: ${summary.decisionCount}`);
  lines.push('');

  // Notes
  lines.push('Notes:');
  lines.push(`- Assumptions: ${summary.notesCounts.assumptions}`);
  lines.push(`- Clarifications: ${summary.notesCounts.clarifications}`);
  // Ticket example only showed Assumptions and Clarifications.
  // But summary has lessonsLearned and projectNotes too.
  // I'll stick to ticket example plus maybe others if relevant.
  // Ticket example:
  // Notes:
  // - Assumptions: 2
  // - Clarifications: 1
  
  return lines.join('\n');
}
