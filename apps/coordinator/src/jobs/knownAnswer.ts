import type { Random } from '../random.ts';
import type { ChatMessage } from '../store/records.ts';

export interface KnownAnswerPrompt {
  messages: ChatMessage[];
  /** The single number a correct reply contains. Kept on the coordinator, never sent. */
  expected: string;
}

const SYSTEM = 'You are a calculator. Reply with the number only.';

function between(random: Random, low: number, high: number): number {
  return low + random.int(high - low + 1);
}

/**
 * A short arithmetic question with exactly one numeric answer. The answer never equals an operand,
 * so a reply that only repeats the question cannot pass.
 */
export function knownAnswerPrompt(random: Random): KnownAnswerPrompt {
  let question: string;
  let answer: number;
  switch (random.int(3)) {
    case 0: {
      const a = between(random, 10, 99);
      const b = between(random, 10, 99);
      question = `What is ${a} plus ${b}?`;
      answer = a + b;
      break;
    }
    case 1: {
      const a = between(random, 50, 99);
      let b = between(random, 10, a - 10);
      if (a - b === b) b += 1;
      question = `What is ${a} minus ${b}?`;
      answer = a - b;
      break;
    }
    default: {
      const a = between(random, 2, 9);
      const b = between(random, 11, 99);
      question = `What is ${a} times ${b}?`;
      answer = a * b;
    }
  }
  return {
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: question },
    ],
    expected: String(answer),
  };
}

function numbersIn(text: string): number[] {
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

/**
 * Whether an output gives the known answer: once the operands quoted from the question are set
 * aside, at least one number remains and every remaining number is the answer.
 */
export function passesKnownAnswer(output: string, expected: string, question: string): boolean {
  const target = Number(expected);
  const operands = new Set(numbersIn(question));
  const found = numbersIn(output).filter((value) => !operands.has(value));
  return found.length > 0 && found.every((value) => value === target);
}
