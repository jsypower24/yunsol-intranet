import { createInterface } from 'node:readline';

export function askHidden(question: string): Promise<string> {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const output = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    rl.question(question, answer => { rl.close(); process.stdout.write('\n'); resolve(answer); });
    output._writeToOutput = (text: string) => { if (text.includes(question)) process.stdout.write(text); };
  });
}
