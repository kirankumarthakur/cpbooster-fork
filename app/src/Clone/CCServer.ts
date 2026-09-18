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

import { createServer, IncomingMessage, ServerResponse } from "http";
import * as fs from "fs";
import * as Path from "path";
import ProblemData from "../Types/ProblemData.js";
import Config from "../Config/Config.js";
import { exit } from "process";
import { spawn, spawnSync } from "child_process";
import Util from "../Utils/Util.js";
import SourceFileCreator from "../Create/SourceFileCreator.js";
import { getEditorCommand } from "./EditorCommandBuilder.js";
import { styleText } from "node:util";
import Tester from "../Test/TesterFactory/Tester.js";

/* Competitive Companion Server */
export default class CCServer {
  contestName = "NO_NAME";
  contestPath = "";
  platform = "NO_PLATFORM";
  config: Config;
  isActive = false;
  lastRequestTime = process.hrtime();
  sourceFiles: Array<{ path: string; testcaseCount: number }> = [];
  constructor(config: Config) {
    this.config = config;
  }

  private handleRequest(request: IncomingMessage, response: ServerResponse): void {
    if (request.method !== "POST" || request.url !== "/") {
      response.writeHead(404);
      response.end();
      return;
    }

    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      const problemData: ProblemData = JSON.parse(body);
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("OK");

      problemData.name = Util.normalizeFileName(problemData.name);
      problemData.group = Util.normalizeFileName(problemData.group);
      this.contestName = problemData.group;
      this.contestPath = Util.getContestPath(this.contestName, this.config);
      if (!fs.existsSync(this.contestPath)) fs.mkdirSync(this.contestPath, { recursive: true });
      if (this.config.createContestPlatformDirectory) {
        let [platform, contestName] = problemData.group.split("-").map((str) => str.trim());
        this.platform = platform;
        // removes platform name from contest name
        contestName = contestName.replace(new RegExp(this.platform, 'g'), "");
        contestName = Util.normalizeFileName(contestName);
        // removes extra dots
        this.contestName = contestName.replace(/\./g, "");
      } else {
        problemData.group = Util.normalizeFileName(problemData.group);
        this.contestName = problemData.group;
      }
      
      const contestPath = this.config.cloneInCurrentDir
        ? this.contestName
        : this.config.createContestPlatformDirectory
		  ? Path.join(this.config.contestsDirectory, this.platform, this.contestName)
		  : Path.join(this.config.contestsDirectory, problemData.group);
      if (!fs.existsSync(contestPath)) fs.mkdirSync(contestPath, { recursive: true });
      const filesPathNoExtension = Path.join(contestPath, problemData.name);
      const extension = `.${this.config.preferredLang}`;
      const requestedFilePath = `${filesPathNoExtension}${extension}`;
      const filePath = SourceFileCreator.createSingle(
        requestedFilePath,
        this.config,
        problemData.timeLimit,
        problemData.memoryLimit,
        problemData.url,
        false
      );
      problemData.tests.forEach((testcase, idx) => {
        fs.writeFileSync(Tester.getInputPath(filePath, idx + 1), testcase.input);
        fs.writeFileSync(Tester.getAnswerPath(filePath, idx + 1), testcase.output);
      });
      const tcLen = problemData.tests.length;
      this.sourceFiles.push({ path: Path.resolve(filePath), testcaseCount: tcLen });
      if (!this.isActive) this.isActive = true;
      this.lastRequestTime = process.hrtime();
    });
  }

  run(): void {
    if (!this.config.preferredLang) {
      console.log("Missing preferred language (preferredLang) key in configuration");
      exit(0);
    }
    const serverRef = createServer((request, response) => this.handleRequest(request, response));
    serverRef.listen(this.config.port, () => {
      console.info("Server running at port:", this.config.port);
      console.info('Waiting for "Competitive Companion Plugin" to send problems...');
    });

    const interval = setInterval(() => {
      if (!this.isActive) return;
      const elapsedTime = process.hrtime(this.lastRequestTime)[0];
      const tolerance = Util.isWindows() ? 4 : 1;
      if (elapsedTime >= tolerance) {
        if (serverRef) serverRef.close();
        clearInterval(interval);
          console.log(styleText("cyan", "\nSource Files"));
          this.sourceFiles.forEach((sourceFile, index) => {
            console.log(`  ${styleText("blue", `${index + 1}.`)} ${sourceFile.path}`);
            console.log(`     ${sourceFile.testcaseCount} testcase${sourceFile.testcaseCount === 1 ? "" : "s"}`);
          });
          console.log(styleText("green", "\nDONE!"));
          console.log(`Contest folder: "${this.contestPath}"`);
          console.log("Happy Coding!\n");
        const command = getEditorCommand(this.config.editor, this.contestPath);
        if (command) {
          const newTerminalExec = spawn(command, { shell: true, detached: true, stdio: "ignore" });
          newTerminalExec.unref();
          if (this.config.closeAfterClone && !Util.isWindows()) {
            const execution = spawnSync("ps", ["-o", "ppid=", "-p", `${process.ppid}`]);
            const grandParentPid = parseInt(execution.stdout.toString().trim());
            if (!Number.isNaN(grandParentPid)) {
              process.kill(grandParentPid, "SIGKILL");
            }
          }
        } else {
          console.log(
            styleText("yellow",
              "The terminal specified in the configuration " +
                "file is not fully supported yet, you will have to change your directory manually\n"
            )
          );
        }
        exit(0);
      }
    }, 100);
  }
} 
