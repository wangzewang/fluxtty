import type { WaterfallArea } from '../waterfall/WaterfallArea';

interface PlanStep {
  paneId: number;
  cmd: string;
  paneName: string;
}

type PlanLogFn = (text: string, cls?: string) => void;

let waterfallArea: WaterfallArea | null = null;
let logFn: PlanLogFn | null = null;

export function setPlanWaterfallArea(area: WaterfallArea) {
  waterfallArea = area;
}

export function setPlanLogFn(fn: PlanLogFn) {
  logFn = fn;
}

class PlanExecutor {
  private plan: PlanStep[] | null = null;
  private planTitle = '';
  private waitingForConfirm = false;

  setPlan(steps: PlanStep[], title: string) {
    this.plan = steps;
    this.planTitle = title;
    this.waitingForConfirm = true;
  }

  getPlanPreview(): string {
    if (!this.plan) return '';
    const lines = [`Plan: ${this.planTitle}`, ''];
    for (const step of this.plan) {
      lines.push(`  ${step.paneName} ❯ ${step.cmd}`);
    }
    lines.push('');
    lines.push('Confirm? (y/n)');
    return lines.join('\n');
  }

  isWaitingForConfirm(): boolean {
    return this.waitingForConfirm;
  }

  async handleConfirm(input: string): Promise<string> {
    if (!this.waitingForConfirm || !this.plan) return '';

    if (input.trim().toLowerCase() === 'y') {
      const plan = this.plan;
      this.plan = null;
      this.waitingForConfirm = false;
      await this.executePlan(plan);
      return 'Plan executed.';
    } else {
      this.plan = null;
      this.waitingForConfirm = false;
      return 'Plan cancelled.';
    }
  }

  private async executePlan(steps: PlanStep[]) {
    for (const step of steps) {
      if (logFn) logFn(`  ${step.paneName} ❯ ${step.cmd}`, 'plan-step');
      const tp = waterfallArea?.getPane(step.paneId);
      if (tp) {
        await tp.writeCommand(step.cmd);
      }
      await delay(300);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const planExecutor = new PlanExecutor();
