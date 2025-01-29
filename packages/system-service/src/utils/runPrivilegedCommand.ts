import { checkPrivileges } from "./checkPrivileges.js";

export async function runPrivilegedCommand(command: string): Promise<string> {
    checkPrivileges();
    const { exec } = await import("child_process");
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            if (stderr) {
                reject(stderr);
                return;
            }
            resolve(stdout);
        });
    });
}