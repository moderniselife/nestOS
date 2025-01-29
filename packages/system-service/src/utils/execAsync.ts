import { spawn } from "child_process";

interface ExecResult {
    stdout: string;
    stderr: string;
}

export const execAsync = async (command: string): Promise<ExecResult> => {
    return new Promise((resolve, reject) => {
        const child = spawn(command, { shell: true });
        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (data) => {
            stdout += data.toString();
        });

        child.stderr.on("data", (data) => {
            stderr += data.toString();
        });

        child.on("close", (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
            } else {
                reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
            }
        });

        child.on("error", (error) => {
            reject(error);
        });
    });
};