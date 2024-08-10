#!/usr/bin/env node

import { homedir } from "node:os";
import process from "node:process";
import fs from "node:fs/promises";
import { exec } from "node:child_process";
import { S3Client } from "@bradenmacdonald/s3-lite-client";

function getMacOsInfoPlist(engine, bucketName: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSServices</key>
	<array>
		<dict>
			<key>NSMenuItem</key>
			<dict>
				<key>default</key>
				<string>Upload to ${engine} - ${bucketName}</string>
			</dict>
			<key>NSMessage</key>
			<string>runWorkflowAsService</string>
			<key>NSSendFileTypes</key>
			<array>
				<string>public.item</string>
			</array>
		</dict>
	</array>
</dict>
</plist>
`;
}

function getMacOsDocumentWflow(endpoint: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>AMApplicationVersion</key>
    <string>2.8</string>
    <key>AMDocumentVersion</key>
    <string>2</string>
    <key>actions</key>
    <array>
        <dict>
            <key>action</key>
            <dict>
                <key>AMAccepts</key>
                <dict>
                    <key>Container</key>
                    <string>List</string>
                    <key>Optional</key>
                    <true/>
                    <key>Types</key>
                    <array>
                        <string>com.apple.cocoa.string</string>
                    </array>
                </dict>
                <key>AMActionVersion</key>
                <string>2.0.3</string>
                <key>ActionBundlePath</key>
                <string>/System/Library/Automator/Run Shell Script.action</string>
                <key>ActionName</key>
                <string>Run Shell Script</string>
                <key>ActionParameters</key>
                <dict>
                    <key>COMMAND_STRING</key>
                    <string>npx straightup ship ${endpoint} "$@"</string>
                    <key>shell</key>
                    <string>/bin/zsh</string>
                </dict>
                <key>BundleIdentifier</key>
                <string>com.apple.RunShellScript</string>
                <key>Class Name</key>
                <string>RunShellScriptAction</string>
            </dict>
        </dict>
    </array>
</dict>
</plist>`;
}

// deno-lint-ignore require-await
async function main() {
  const [operation, endpoint] = process.argv.slice(2);

  if (operation === "setup") {
    if (!endpoint) {
      console.error("usage: straightup setup s3://bucket-name");
      return;
    }

    if (!endpoint.startsWith("s3://")) {
      console.error("The endpoint must be an S3 bucket");
      return;
    }

    // const buttonText = `Straight Up to ${endpoint}!`;

    const bucketName = endpoint.replace("s3://", "");

    const outputDirectory = `${homedir()}/Library/Services`;
    const getInfoPlist = getMacOsInfoPlist("s3", bucketName);
    const getDocumentWflow = getMacOsDocumentWflow(endpoint);

    const workflowDir =
      `${outputDirectory}/Upload to S3 - ${bucketName}!.workflow/Contents`;

    await fs.mkdir(workflowDir, { recursive: true });

    await fs.writeFile(`${workflowDir}/Info.plist`, getInfoPlist);
    await fs.writeFile(`${workflowDir}/document.wflow`, getDocumentWflow);
    console.log("Service Created:");
    console.log("right-click on a file -> Services ->");
    console.log(`Upload to S3 - ${bucketName}!`);
  } else if (operation === "ship") {
    const aws_access_key_id = process.env.AWS_ACCESS_KEY_ID;
    const aws_secret_access_key = process.env.AWS_SECRET_ACCESS_KEY;
    const aws_region = process.env.AWS_REGION || "us-east-1";

    if (!aws_access_key_id || !aws_secret_access_key) {
      console.error(
        "'AWS_ACCESS_KEY_ID' and 'AWS_SECRET_ACCESS_KEY' must be set",
      );
    }

    const s3 = new S3Client({
      accessKey: aws_access_key_id,
      secretKey: aws_secret_access_key,
      region: aws_region,
      bucket: "serveon-test",
      endPoint: "s3.amazonaws.com",
    });

    const [_operation, endpoint, filePath] = process.argv.slice(2);

    const content = await fs.readFile(filePath);

    await s3.putObject(filePath.split("/").pop()!, content);

    const osastr =
      `osascript -e 'display notification "${filePath} uploaded to ${endpoint}" with title "Upload Complete!"'`;

    exec(osastr, console.log);
  }
}
await main();