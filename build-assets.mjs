import { copyFile, mkdir } from "node:fs/promises";

const target = new URL("./dist/", import.meta.url);
await mkdir(target, { recursive: true });
for (const file of ["index.html", "style.css", "background.js", "prism.js", "markdown-it.js", "openai.png"]) {
  await copyFile(new URL(file, import.meta.url), new URL(file, target));
}
