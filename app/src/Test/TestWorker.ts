import { parentPort, workerData } from "node:worker_threads";
import { ICommandTestArgs, runTestInCurrentThread } from "./Test.js";

if (!parentPort) {
  throw new Error("Test worker must be started by the test command");
}

runTestInCurrentThread(workerData as ICommandTestArgs);
