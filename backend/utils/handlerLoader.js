import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { HANDLER_NAME_MAP } from "../common/constants_6_15.js";

/**
 * Gets the display name for a handler based on its file name.
 * Falls back to the file name (camelCase) if no mapping exists.
 * 
 * @param {string} fileName - The handler file name without extension
 * @returns {string} The display name for the handler
 */
function getHandlerDisplayName(fileName) {
  return HANDLER_NAME_MAP[fileName] ?? fileName;
}

/**
 * Loads all CSV handler modules from the handlers directory.
 * Excludes baseHandler.js and any non-JS files.
 * 
 * @returns {Promise<Object>} An object mapping display names to handler classes
 * @throws {Error} If the handlers directory cannot be read or modules fail to load
 */
export const loadHandlers = async () => {
  const handlersDir = path.join(process.cwd(), "backend/csv-handlers");
  
  // Validate directory exists
  if (!fs.existsSync(handlersDir)) {
    throw new Error(`Handlers directory not found: ${handlersDir}`);
  }

  // Read handler files
  const files = fs.readdirSync(handlersDir)
    .filter(f => f.endsWith(".js") && f !== "baseHandler.js");

  const handlers = {};
  const errors = [];

  // Load each handler module
  for (const file of files) {
    try {
      const filePath = pathToFileURL(path.join(handlersDir, file)).href;
      const module = await import(filePath);
      
      if (!module.default) {
        console.warn(`[handlerLoader] ${file} does not export a default export`);
        continue;
      }

      const optionName = file.replace(".js", "");
      const handlerName = getHandlerDisplayName(optionName);
      
      handlers[handlerName] = module.default;
    } catch (error) {
      const errorMsg = `Failed to load handler ${file}: ${error.message}`;
      console.error(`[handlerLoader] ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  // Log summary
  const loadedCount = Object.keys(handlers).length;
  console.log(`[handlerLoader] Loaded ${loadedCount} handler(s) from ${handlersDir}`);
  
  if (errors.length > 0) {
    console.warn(`[handlerLoader] ${errors.length} handler(s) failed to load`);
  }

  if (loadedCount === 0) {
    throw new Error("No handlers were successfully loaded. Check handler files and ensure they export a default class.");
  }

  return handlers;
};
