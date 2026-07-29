// Name: Prepare
// Description: Set up directories and convert JSON source files to HTML
import { Logger } from "../utils/logger";
import { preparation } from "../instructions/0_preparation";

Logger.info("Prepare start");
await preparation();
