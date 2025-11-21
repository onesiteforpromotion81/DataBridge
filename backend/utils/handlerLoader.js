import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

export const loadHandlers = async () => {
  const handlersDir = path.join(process.cwd(), "backend/csv-handlers");
  const files = fs.readdirSync(handlersDir)
    .filter(f => f.endsWith(".js") && f !== "baseHandler.js");

  const handlers = {};
  for (const file of files) {
    // Convert absolute path to file:// URL
    const filePath = pathToFileURL(path.join(handlersDir, file)).href;
    const module = await import(filePath);
    const optionName = file.replace(".js", "");
    let handlerName;
    handlerName = handlerName ?? (optionName === 'accountClassifications' ? '金種' : undefined);
    handlerName = handlerName ?? (optionName === 'businessTypes' ? '業務形態' : undefined);
    handlerName = handlerName ?? (optionName === 'slipTypes' ? '伝票種別' : undefined);
    handlers[handlerName] = module.default;
  }

  return handlers;
};
