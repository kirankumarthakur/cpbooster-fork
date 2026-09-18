/*
    cpbooster "Competitive Programming Booster"
    Copyright (C) 2020  Sergio G. Sanchez V.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import Config from "../../Config/Config.js";
import { Veredict } from "../../Types/Veredict.js";
import Util from "../../Utils/Util.js";
import * as fs from "fs";
import os from "os";
import { exit } from "process";
import { styleText } from "node:util";
import { spawnSync } from "child_process";
import * as Path from "path";

type ExecutionMetrics = {
  elapsedSeconds: number;
  memoryMegabytes: number | undefined;
};
type CardColor = "blue" | "mauve" | "green" | "red" | "yellow" | "cyan" | "maroon" | "peach";

const cardColors: Record<CardColor, string> = {
  blue: "137;180;250",
  mauve: "203;166;247",
  green: "166;227;161",
  red: "243;139;168",
  yellow: "249;226;175",
  cyan: "137;220;235",
  maroon: "139;63;70",
  peach: "250;179;135"
};

function card(text: string, color: CardColor): string {
  return `\u001b[38;2;0;0;0m\u001b[48;2;${cardColors[color]}m${text}\u001b[0m`;
}

function underlinedHeader(text: string, color: CardColor): string {
  return `\u001b[1;4;38;2;${cardColors[color]}m${text}\u001b[0m`;
}

function metricValue(text: string, withinLimit: boolean | undefined): string {
  if (withinLimit === undefined) return text;
  return `\u001b[38;2;${cardColors[withinLimit ? "green" : "red"]}m${text}\u001b[0m`;
}

export default abstract class Tester {
  config: Config;
  filePath: string;
  langExtension: string;
  private latestExecutionMetrics: ExecutionMetrics | undefined;
  private latestOutput = "";
  private latestExpectedOutput: string | undefined;
  private slowestExecutionSeconds = 0;
  private maximumMemoryMegabytes = 0;

  constructor(config: Config, filePath: string) {
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${filePath}`);
      exit(0);
    }
    this.config = config;
    this.filePath = filePath;
    this.langExtension = Path.extname(this.filePath).slice(1).toLowerCase();
  }

  abstract testOne(testId: number, compile: boolean): Veredict;

  abstract debugOne(testId: number, compile: boolean): void;

  abstract debugWithUserInput(compile: boolean): void;

  testAll(compile: boolean): void {
    const testcasesIds = Tester.getTestCasesIds(this.filePath);
    if (testcasesIds.length == 0) {
      console.log("No testcases available for this file:", this.filePath);
      exit(0);
    }
    const verdictCounts = new Map<Veredict, number>();
    let veredict = this.testOne(testcasesIds[0], compile);
    verdictCounts.set(veredict, 1);
    if (veredict === Veredict.CE || veredict === Veredict.ERROR) {
      exit(0);
    }
    for (let i = 1; i < testcasesIds.length; i++) {
      veredict = this.testOne(testcasesIds[i], false);
      verdictCounts.set(veredict, (verdictCounts.get(veredict) ?? 0) + 1);
    }
    this.printScore(verdictCounts, testcasesIds.length);
  }

  extractTimeLimit(): number {
    const text = fs.readFileSync(this.filePath).toString();
    const commentString = Util.getCommentString(this.langExtension, this.config);
    const re = new RegExp(
      String.raw`^\s*${commentString}\s*time-limit\s*:\s*([0-9]+)(?:\s*,\s*memory-limit\s*:\s*[0-9]+(?:\.[0-9]+)?)?\s*$`,
      "m"
    );
    const match = re.exec(text);
    let time = 3000; // Default time
    if (match) {
      time = parseInt(match[1]);
    }
    return time;
  }

  extractMemoryLimit(): number | undefined {
    const text = fs.readFileSync(this.filePath).toString();
    const commentString = Util.getCommentString(this.langExtension, this.config);
    const re = new RegExp(
      String.raw`^\s*${commentString}\s*(?:time-limit\s*:\s*[0-9]+\s*,\s*)?memory-limit\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*$`,
      "m"
    );
    const match = re.exec(text);
    return match ? Number(match[1]) : undefined;
  }

  getFormattedVeredict(veredict: Veredict): string {
    switch (veredict) {
      case Veredict.AC:
      case Veredict.AC_WHEN_TRIMMED:
        return underlinedHeader("AC", "green");
      case Veredict.WA:
        return underlinedHeader("WA", "red");
      case Veredict.RTE:
        return underlinedHeader("RTE", "blue");
      case Veredict.TLE:
        return underlinedHeader("TLE", "mauve");
      case Veredict.CE:
        return underlinedHeader("CE", "yellow");
      default:
        return "UNDETERMINED";
    }
  }

  printTestResults(veredict: Veredict, feedback: string, testId: number): void {
    if (veredict !== Veredict.CE) {
      const metrics = this.latestExecutionMetrics;
      const memoryLimit = this.extractMemoryLimit();
      const metricText = metrics
        ? ` | Time: ${metricValue(
            `${metrics.elapsedSeconds.toFixed(6)} sec`,
            metrics.elapsedSeconds * 1000 <= this.extractTimeLimit()
          )} | Memory: ${
            metrics.memoryMegabytes === undefined
              ? "unavailable"
              : metricValue(
                  `${metrics.memoryMegabytes.toFixed(6)} MB`,
                  memoryLimit === undefined ? undefined : metrics.memoryMegabytes <= memoryLimit
                )
          }`
        : "";
      console.log(
        card(` Test Case ${testId} `, "peach"),
        "│",
        this.getFormattedVeredict(veredict),
        metricText
      );
      if (!this.config.hideTestCaseInput) {
        const input = fs.readFileSync(Tester.getInputPath(this.filePath, testId)).toString();
        console.log(underlinedHeader("Input", "blue"));
        const inputLines = input.split(/\n|\r\n/);
        if (
          this.config.maxLinesToShowFromInput === 0 ||
          inputLines.length <= this.config.maxLinesToShowFromInput
        ) {
          console.log(inputLines.join(os.EOL).trimEnd());
        } else {
          const reducedInputLines = [
            ...inputLines.slice(0, this.config.maxLinesToShowFromInput),
            "... (the rest of the input is hidden)"
          ].join(os.EOL);
          console.log(reducedInputLines);
        }
        console.log();
      }
      if (this.latestExpectedOutput !== undefined) {
        this.printOutputComparison();
      } else {
        console.log(underlinedHeader("Your Output", "blue"));
        console.log(this.latestOutput.trimEnd());
      }
    } else {
      console.log(card(" Test Case ", "peach"), this.getFormattedVeredict(veredict));
    }

    if (feedback.trim()) console.log(`\n${feedback.trimEnd()}`);
    console.log(styleText("gray", "─".repeat(Math.min(process.stdout.columns || 80, 100))));
  }

  private printOutputComparison(): void {
    const actualLines = this.latestOutput.trimEnd().split(/\r?\n/);
    const expectedLines = (this.latestExpectedOutput ?? "").trimEnd().split(/\r?\n/);
    const terminalWidth = Math.min(process.stdout.columns || 80, 100);
    const separatorWidth = 3;
    const minimumColumnWidth = 12;
    const maximumColumnWidth = 48;
    const availableWidth = Math.max(2 * minimumColumnWidth + separatorWidth, terminalWidth - separatorWidth);
    const actualWidth = Math.min(
      maximumColumnWidth,
      Math.max(minimumColumnWidth, Math.max(" Your Output ".length, ...actualLines.map((line) => line.length)))
    );
    const expectedWidth = Math.min(
      maximumColumnWidth,
      Math.max(minimumColumnWidth, Math.max(" Actual Output ".length, ...expectedLines.map((line) => line.length)))
    );
    let columnWidths = [actualWidth, expectedWidth];
    if (actualWidth + expectedWidth > availableWidth) {
      const targetWidth = Math.floor((availableWidth - minimumColumnWidth * 2) / 2);
      columnWidths = [
        Math.max(minimumColumnWidth, Math.min(actualWidth, targetWidth + minimumColumnWidth)),
        Math.max(minimumColumnWidth, Math.min(expectedWidth, availableWidth - separatorWidth - (targetWidth + minimumColumnWidth)))
      ];
    }
    const [actualColumnWidth, expectedColumnWidth] = columnWidths;
    const fit = (line: string, width: number): string =>
      line.length > width ? `${line.slice(0, Math.max(0, width - 1))}…` : line.padEnd(width);
    console.log(
      underlinedHeader(fit("Your Output", actualColumnWidth), "blue") +
        " │ " +
        underlinedHeader(fit("Actual Output", expectedColumnWidth), "mauve")
    );
    for (let index = 0; index < Math.max(actualLines.length, expectedLines.length); index++) {
      console.log(
        fit(actualLines[index] ?? "", actualColumnWidth) +
          " │ " +
          fit(expectedLines[index] ?? "", expectedColumnWidth)
      );
    }
  }

  protected runDebug(execCommand: string, args: string[], testId: number): void {
    console.log("Running Test Case", testId, "with debugging flags\n");
    const execution = spawnSync(
      execCommand,
      [...args, "<", `"${Tester.getInputPath(this.filePath, testId)}"`],
      { shell: true }
    );

    if (execution.stdout.toString()) {
      console.log(execution.stdout.toString());
    }

    if (execution.stderr.toString()) {
      console.log(
        Util.replaceAll(execution.stderr.toString(), "runtime error", styleText("red", "runtime error"))
      );
    }
  }

  getTestVeredict(
    execCommand: string,
    args: string[],
    testId: number,
    hasValidConditions: () => { status: boolean; feedback: string },
    shouldCompile?: boolean,
    compile?: (isDebug: boolean) => { status: boolean; feedback: string }
  ): { veredict: Veredict; feedback: string } {
    let feedback = "";
    let finalVeredict = Veredict.UNDETERMINED;

    if (shouldCompile && compile) {
      const compilationState = compile(false);
      if (!compilationState.status) {
        return { veredict: Veredict.CE, feedback: compilationState.feedback };
      }
    }

    const preConditionState = hasValidConditions();

    if (!preConditionState.status) {
      feedback += preConditionState.feedback;
      finalVeredict = Veredict.ERROR;
    } else {
      const execution = this.executeWithMetrics(execCommand, args, testId);
      this.latestExecutionMetrics = execution.metrics;
      // TODO: Extract logic of each condition to small functions
      if (execution.error?.message.includes("ETIMEDOUT")) {
        finalVeredict = Veredict.TLE;
      } else if (execution.status !== 0) {
        if (execution.stdout.toString()) feedback += execution.stdout.toString() + "\n";
        if (execution.stderr.toString()) feedback += execution.stderr.toString() + "\n";
        finalVeredict = Veredict.RTE;
      } else {
        const answerFilePath = Tester.getAnswerPath(this.filePath, testId);

        if (fs.existsSync(answerFilePath)) {
          let output = execution.stdout?.toString() ?? "";
          const ans = fs.readFileSync(answerFilePath).toString();
          this.latestOutput = output;
          this.latestExpectedOutput = ans;
          if(Util.isWindows()){
            output = output.replace(/\r\n/g, "\n");
          }

          const trimmedOutput = output.trim();
          const trimmedAns = ans.trim();
          const outputLines = trimmedOutput.split("\n");
          const ansLines = trimmedAns.split("\n");

          const trimmedOutputLines = outputLines.map((item) => {
            return item.trim(); // remove '\r' char if exists
          });
          const trimmedAnsLines = ansLines.map((item) => {
            return item.trim(); // remove '\r' char if exists
          });

          const isTrimmedOutputSame =
            trimmedOutputLines.length === trimmedAnsLines.length &&
            Util.sequence(0, trimmedAnsLines.length).every(
              (index) => trimmedOutputLines[index] === trimmedAnsLines[index]
            );

          if (isTrimmedOutputSame) {
            if (ans !== output) {
              feedback += styleText("yellow", "Check leading and trailing blank spaces") + "\n\n";
              finalVeredict = Veredict.AC_WHEN_TRIMMED;
            } else {
              finalVeredict = Veredict.AC;
            }
          } else {
            feedback += getMismatchMessage(trimmedOutputLines, trimmedAnsLines);
            finalVeredict = Veredict.WA;
          }
        } else {
          this.latestOutput = execution.stdout?.toString() ?? "";
          this.latestExpectedOutput = undefined;
          feedback += `answer file not found in ${answerFilePath}\n`;
          finalVeredict = Veredict.RTE;
        }
        const outputFilePath = Tester.getOutputPath(this.filePath, testId);
        fs.writeFileSync(outputFilePath, execution.stdout.toString());
      }
    }
    return {
      veredict: finalVeredict,
      feedback
    };
  }

  private executeWithMetrics(
    execCommand: string,
    args: string[],
    testId: number
  ): { stdout: Buffer; stderr: Buffer; status: number | null; error?: Error; metrics: ExecutionMetrics } {
    const input = fs.readFileSync(Tester.getInputPath(this.filePath, testId));
    const timeout = this.extractTimeLimit() + 500;
    const hyperfinePath = "/usr/bin/hyperfine";
    let stdout = Buffer.alloc(0);
    let status: number | null = null;
    let error: Error | undefined;
    let elapsedSeconds: number;
    let memoryMegabytes: number | undefined;
    let stderr: Buffer;

    if (!Util.isWindows() && fs.existsSync(hyperfinePath)) {
      const start = process.hrtime.bigint();
      const tempDirectory = fs.mkdtempSync(Path.join(os.tmpdir(), "cpbooster-"));
      const inputPath = Path.join(tempDirectory, "input");
      const stdoutPath = Path.join(tempDirectory, "stdout");
      const stderrPath = Path.join(tempDirectory, "stderr");
      const resultPath = Path.join(tempDirectory, "result.json");
      fs.writeFileSync(inputPath, input);
      const shellQuote = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;
      const command = [
        ...[execCommand, ...args].map(shellQuote),
        `< ${shellQuote(inputPath)}`,
        `> ${shellQuote(stdoutPath)}`,
        `2> ${shellQuote(stderrPath)}`
      ].join(" ");
      const execution = spawnSync(
        hyperfinePath,
        ["--runs", "1", "--warmup", "0", "--export-json", resultPath, command],
        { timeout }
      );
      stderr = fs.readFileSync(stderrPath);
      stdout = fs.readFileSync(stdoutPath);
      elapsedSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
      status = execution.status;
      error = execution.error;
      const resultText = fs.existsSync(resultPath) ? fs.readFileSync(resultPath, "utf8").trim() : "";
      if (resultText) {
        try {
          const result = JSON.parse(resultText) as {
            results: Array<{ mean: number; memory_usage_byte?: number[]; exit_codes?: number[] }>;
          };
          const benchmark = result.results[0];
          if (benchmark) {
            elapsedSeconds = benchmark.mean;
            memoryMegabytes = benchmark.memory_usage_byte?.[0] === undefined
              ? undefined
              : benchmark.memory_usage_byte[0] / (1024 * 1024);
            status = benchmark.exit_codes?.[0] ?? execution.status;
          }
        } catch (parseError) {
          if (!(parseError instanceof SyntaxError)) {
            throw parseError;
          }
        }
      }
      fs.rmSync(tempDirectory, { recursive: true, force: true });
    } else {
      const start = process.hrtime.bigint();
      const execution = spawnSync(execCommand, args, { input, timeout });
      stdout = execution.stdout ?? Buffer.alloc(0);
      stderr = execution.stderr ?? Buffer.alloc(0);
      status = execution.status;
      error = execution.error;
      elapsedSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
    }
    const metrics = { elapsedSeconds, memoryMegabytes };
    this.slowestExecutionSeconds = Math.max(this.slowestExecutionSeconds, elapsedSeconds);
    if (memoryMegabytes !== undefined) {
      this.maximumMemoryMegabytes = Math.max(this.maximumMemoryMegabytes, memoryMegabytes);
    }
    return {
      stdout,
      stderr,
      status,
      error,
      metrics
    };
  }

  protected runDebugWithUserInput(command: string, args: string[] = []): void {
    console.log("Running with debugging flags\n\nEnter your input manually\n");
    spawnSync(command, args, { stdio: "inherit" });
  }

  static getInputPath(filePath: string, testId: number): string {
    const filePathNoExtension = filePath.substring(0, filePath.lastIndexOf("."));
    return Util.normalizeFilePath(`${filePathNoExtension}.in${testId}`);
  }

  static getOutputPath(filePath: string, testId: number): string {
    const filePathNoExtension = filePath.substring(0, filePath.lastIndexOf("."));
    return Util.normalizeFilePath(`${filePathNoExtension}.out${testId}`);
  }

  static getAnswerPath(filePath: string, testId: number): string {
    const filePathNoExtension = filePath.substring(0, filePath.lastIndexOf("."));
    return Util.normalizeFilePath(`${filePathNoExtension}.ans${testId}`);
  }

  static getTestCasesIds(filePath: string): number[] {
    const parsedPath = Path.parse(filePath);
    let directoryPath = parsedPath.dir;
    if (directoryPath == "") directoryPath = ".";
    const fileNameNoExtension = parsedPath.name;
    const testcasesFiles = fs
      .readdirSync(directoryPath)
      .filter((fileName) => fileName.startsWith(`${fileNameNoExtension}.in`));
    const testcasesIds: number[] = [];
    testcasesFiles.forEach((filename) => {
      const num = parseInt(filename.replace(`${fileNameNoExtension}.in`, ""));
      testcasesIds.push(num);
    });
    return testcasesIds.sort((tid1, tid2) => tid1 - tid2);
  }

  /**
   * @param {string} filePath path to the source code file
   * @returns the id with maximum numeric value from all the
   * test cases that correspond to `filePath`
   */
  static getMaxTestCaseId(filePath: string): number {
    const testCasesIds = Tester.getTestCasesIds(filePath);
    return testCasesIds.length === 0 ? 0 : Math.max(...testCasesIds);
  }

  /**
   * Computes the unique Id of a testcase that does not exist yet,
   * useful to know what will be the id of the next new testcase
   * before actually creating it.
   * @param {string} filePath path to the source code file
   * @returns the id of the next testcase
   */
  static getNextTestCaseId(filePath: string): number {
    return Tester.getMaxTestCaseId(filePath) + 1;
  }

  static async createTestCase(filePath: string): Promise<void> {
    const thisTCId = Tester.getNextTestCaseId(filePath);
    console.log("\nPress ctrl+D to finish your input\n");
    console.log("Test Case Input:\n");
    const input = await Util.readToEOF();
    console.log("\nTest Case Correct Output:\n");
    const answer = await Util.readToEOF();
    fs.writeFileSync(Tester.getInputPath(filePath, thisTCId), input);
    fs.writeFileSync(Tester.getAnswerPath(filePath, thisTCId), answer);
    console.log("\nTest case", thisTCId, "written.");
  }

  printScore(verdictCounts: Map<Veredict, number>, total: number): void {
    const labels: Array<[Veredict, string, CardColor]> = [
      [Veredict.AC, "AC", "green"],
      [Veredict.AC_WHEN_TRIMMED, "AC", "green"],
      [Veredict.WA, "WA", "red"],
      [Veredict.RTE, "RTE", "blue"],
      [Veredict.TLE, "TLE", "mauve"],
      [Veredict.CE, "CE", "yellow"],
      [Veredict.ERROR, "ERROR", "red"]
    ];
    const status = labels
      .map(([verdict, label, color]) => {
        const count = verdictCounts.get(verdict) ?? 0;
        return count > 0 ? underlinedHeader(`${count} ${label}`, color) : "";
      })
      .filter(Boolean)
      .join(", ");
    console.log(card(" Summary ", "cyan"));
    console.log(
      `Status : ${status || `${total} UNDETERMINED`}`
    );
    console.log(`Time   : ${this.slowestExecutionSeconds.toFixed(6)} sec (peak)`);
    console.log(
      `Memory : ${
        this.maximumMemoryMegabytes === 0
          ? "unavailable"
          : `${this.maximumMemoryMegabytes.toFixed(6)} MB (peak)`
      }`
    );
    console.log(styleText("gray", "─".repeat(Math.min(process.stdout.columns || 80, 100))));
  }

  static printCompilationErrorMsg(): void {
    console.log(card(" Compilation Error ", "yellow"), "\n");
  }

  protected getSegmentedCommand(langExtension: string, debug: boolean): string[] {
    const langConfig = this.config.languages[langExtension];

    if (langConfig) {
      let segmentedCommand: string[];
      if (debug) {
        segmentedCommand = langConfig.debugCommand.split(" ");
      } else {
        segmentedCommand = langConfig.command.split(" ");
      }
      // TODO: log message and exit(0) when segmentedCommand is empty
      return segmentedCommand;
    } else {
      console.log(
        `${
          debug ? "debug " : ""
        }command not specified in cpbooster-config.json for ${langExtension} files`
      );
      exit(0);
    }
  }

  protected getCompilerCommand(langExtension: string, debug: boolean): string {
    return this.getSegmentedCommand(langExtension, debug)[0];
  }
}

function getOutputDiff(trimmedOutputLines: string[], trimmedAnsLines: string[]) {
  let outputDiff = "";
  let maxOutputWidth = 0;
  for (let i = 0; i < trimmedOutputLines.length; i++) {
    if (trimmedOutputLines[i].length > maxOutputWidth) {
      maxOutputWidth = trimmedOutputLines[i].length;
    }

  }
  const columnWidth = Math.min(Math.max(maxOutputWidth, 16), process.stdout.columns - 8);
  const leftHeader = styleText("bgRed", Util.padCenter("Actual Output", columnWidth));
  const rightHeader = styleText("bgGreen", Util.padCenter("Correct Answer", columnWidth));
  outputDiff += leftHeader + "|" + rightHeader + "\n";
  outputDiff += "".padEnd(columnWidth) + "|" + "".padEnd(columnWidth) + "\n";
  for (let i = 0; i < Math.max(trimmedOutputLines.length, trimmedAnsLines.length); i++) {
    let line = "";
    if (i < trimmedOutputLines.length) {
      line += trimmedOutputLines[i].padEnd(columnWidth) + "|";
    } else {
      line += "".padEnd(columnWidth) + "|";
    }

    if (i < trimmedAnsLines.length) {
      line += trimmedAnsLines[i].padEnd(columnWidth);
    } else {
      line += "".padEnd(columnWidth);
    }

    if (
      i < trimmedOutputLines.length &&
      i < trimmedAnsLines.length &&
      trimmedOutputLines[i] === trimmedAnsLines[i]
    ) {
      line += styleText("bgGreen", "  ");
    } else {
      line += styleText("bgRed", "  ");
    }

    outputDiff += line + "\n";
  }
  return outputDiff + "\n";
}

function getMismatchMessage(outputLines: string[], answerLines: string[]): string {
  const mismatchIndex = outputLines.findIndex((line, index) => line !== answerLines[index]);
  const index = mismatchIndex === -1 ? Math.min(outputLines.length, answerLines.length) : mismatchIndex;
  const output = outputLines[index] ?? "<missing>";
  const expected = answerLines[index] ?? "<missing>";
  return (
    `Mismatch on line ${index + 1}: expected (${JSON.stringify(expected)}) received (${JSON.stringify(output)})\n`
  );
}
