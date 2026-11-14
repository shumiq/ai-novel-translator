// Name: Finalize
// Description: Convert translated Thai HTML files back to JSON format
import { Logger } from "../utils/logger";
import { finalization } from "../instructions/99_finalization";
import { useActiveTitle } from "../utils/title";

useActiveTitle();
Logger.info("Finalize start");
await finalization();
