import "dotenv/config";
import { SUPPORTED_CHAIN_ID, ThirdwebSDK } from "@thirdweb-dev/sdk";
import { readFileSync } from "fs";
import { chainIdToName } from "./constants";

////// To run this script: `npx ts-node scripts/release/approve_implementations_from_release.ts` //////
///// MAKE SURE TO PUT IN THE RIGHT CONTRACT NAME HERE AFTER CREATING A RELEASE FOR IT /////
//// THE RELEASE SHOULD HAVE THE IMPLEMENTATIONS ALREADY DEPLOYED AND RECORDED (via dashboard) ////
const releasedContractName = "AirdropERC1155Claimable";
const privateKey: string = process.env.DEPLOYER_KEY as string; // should be the correct deployer key

const polygonSDK = ThirdwebSDK.fromPrivateKey(privateKey, "polygon");

async function main() {
  const releaser = await polygonSDK.wallet.getAddress();
  console.log("Releasing as", releaser);

  const latest = await polygonSDK.getPublisher().getLatest(releaser, releasedContractName);

  if (latest && latest.metadataUri) {
    console.log(latest);
    const prev = await polygonSDK.getPublisher().fetchPublishedContractInfo(latest);

    console.log("Fetched latest version", prev);
    const prevReleaseMetadata = prev.publishedMetadata;

    const implementations = prev.publishedMetadata.factoryDeploymentData?.implementationAddresses;
    console.log("Implementations", implementations);

    if (!implementations) {
      console.log("No implementations to approve");
      return;
    }

    // Approving implementations
    console.log("Approving implementations...");
    for (const [chainId, implementation] of Object.entries(implementations)) {
      const chainName = chainIdToName[parseInt(chainId) as SUPPORTED_CHAIN_ID];

      if (!chainName) {
        console.log("No chainName found for chain: ", chainId);
        continue;
      }

      const chainSDK = ThirdwebSDK.fromPrivateKey(privateKey, chainName);
      const factoryAddr = prevReleaseMetadata?.factoryDeploymentData?.factoryAddresses?.[chainId];
      if (implementation && factoryAddr) {
        const factory = await chainSDK.getContractFromAbi(
          factoryAddr,
          JSON.parse(readFileSync("artifacts_forge/TWFactory.sol/TWFactory.json", "utf-8")).abi,
        );
        const approved = await factory.call("approval", implementation);
        if (!approved) {
          try {
            console.log("Approving implementation", implementation, "on", chainName, "to", factoryAddr);
            await factory.call("approveImplementation", implementation, true);
          } catch (e) {
            console.log("Failed to approve implementation on", chainName, e);
          }
        } else {
          console.log("Implementation", implementation, "already approved on", chainName);
        }
      } else {
        console.log("No implementation or factory address for", chainName);
      }
    }
  } else {
    console.log("No previous release found");
    return;
  }

  console.log("All done.");
  console.log("Release page:", `https://thirdweb.com/${releaser}/${releasedContractName}`);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
