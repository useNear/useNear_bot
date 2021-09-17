const fs = require("fs");
const util = require("util");
const { KeyPair, utils } = require("near-api-js");
const { NFTStorage, File } = require("nft.storage");
const request = require("request");
const axios = require("axios");
const nearAPI = require("near-api-js");
const { API, API_BASE_NEAR_TESTNET } = require("mintbase");
const { timingSafeEqual } = require("crypto");

const requestGet = util.promisify(request.get);
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const deleteFile = util.promisify(fs.unlink);
const readdir = util.promisify(fs.readdir);

const Client = new NFTStorage({ token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWQ6ZXRocjoweDUyNzE4MWUwY2JhNjNjNjQ4NWFjMDEyNjBBMjAyZUE2ZDk1NzAxRWMiLCJpc3MiOiJuZnQtc3RvcmFnZSIsImlhdCI6MTYzMTE2ODU1MjgwNywibmFtZSI6InRnLWJvdCJ9.Qjsmm2I7GG1LTZjNhrbxGPSsyUQU_YXgkWQ0e_Q052c" });

const mintbaseAPI = new API({
    constants: {
        API_BASE_NEAR_TESTNET
    }
});
const NFT_CONTRACT_ADDRESS = "nft-final.test-testing.testnet";
const SPUTNIK_DAO_ADDRESS = "near-week.sputnikv2.testnet";

const isKeyAdded = async (near, accountId, publicKey) => {
    const account = await near.account(accountId);
    const keys = await account.getAccessKeys();
    let result = keys.filter((key) => {
        return key.public_key == publicKey;
    });
    return result ? 1 : 0;
}

const generateKeyPair = async () => {
    const keyPair = KeyPair.fromRandom("ed25519");
    return keyPair;
}

const checkIfKeyPairExists = async (telegramId, accountId) => {
    const accountIdSplit = accountId.split(".");
    const networkId = accountIdSplit[accountIdSplit.length - 1];
    try {
        let file = await readFile(`.near-credentials/${networkId}/${telegramId}_${accountId}.json`, "utf-8");
        return file ? file : 0;
    } catch(e) {
        return 0;
    }
}

const addKeyPair = async (ctx, networkId, accountId, keyPair) => {
    const content = { account_id: accountId, public_key: keyPair.publicKey.toString(), private_key: keyPair.toString() };
    await writeFile(`.near-credentials/${networkId}/${ctx.from.username}_${accountId}.json`, JSON.stringify(content));    
    return content.private_key;
}

const uploadToNFTStorage = async (ctx, title, description, filePath) => {
    
    // writing file to local storage.
    let response  = await requestGet({ url: filePath, encoding: "binary" });
    let titleSplit = title.split(" ");
    title = titleSplit.join("_");
    await writeFile(`./nft_assets/nft_${ctx.from.username}.jpg`, response.body, "binary");
    let fileLocation = `./nft_assets/nft_${ctx.from.username}.jpg`;
    const fileLocationSplit = fileLocation.split(".");
    const fileType = fileLocationSplit[fileLocationSplit.length - 1];
    const fileData = await readFile(fileLocation);
    const metadata = await Client.store({
        name: title,
        description: description,
        image: new File([fileData], `${title}_${ctx.from.username}.jpg`, { type: `image/*` })
    });
    const metadataSplit = metadata.url.split("/", 4);
    const url = "https://ipfs.io/ipfs/" + metadataSplit[metadataSplit.length - 2] + '/'+ metadataSplit[metadataSplit.length - 1];
    await deleteFile(fileLocation);
    return url;
}

const getImageURLFromMetadata = async (url) => {
    let metadata = await axios.get(url);
    let metadataSplit = metadata.data.image.split("/", 4);
    let imageIPFSUrl = "https://dweb.link/ipfs/" + metadataSplit[metadataSplit.length - 2] + '/' + metadataSplit[metadataSplit.length - 1];  
    return imageIPFSUrl;
}

const nftContractInstance = (account) => {
    const nftContract = new nearAPI.Contract(
        account,
        NFT_CONTRACT_ADDRESS,
        {
            viewMethods: ["nft_tokens_for_owner", "nft_metadata", "nft_token"],
            changeMethods: ["nft_transfer", "nft_mint", "new_default_meta", "new"],
            sender: account
        }
    );
    return nftContract;
}

const nftMint = async (nftContract, tokenId, accountId, title, desc, media_url) => {
    const tx = await nftContract.nft_mint(
        {
            args: {
                token_id: tokenId.toString(),
                receiver_id: accountId,
                token_metadata: {
                    title: title,
                    description: desc,
                    media: media_url,
                    copies: 1
                }
            },
            amount: utils.format.parseNearAmount("0.01")   
        }
    );

    return tx;
}

const checkIfWalletEverConnected = async (username) => {
    // read near credentials
    const wallets = await readdir(".near-credentials/testnet", "utf-8");
    const possibleWallets = wallets.filter(wallet => {
        return wallet.startsWith(username);
    });

    for(let i = 0; i < possibleWallets.length; i++) {
        possibleWallets[i] = possibleWallets[i].replace(username + "_", "");
        possibleWallets[i] = possibleWallets[i].replace(".json", "");
    }

    return possibleWallets;
}

const checkIfPossibleWalletIsAMinter = async (possibleWallets, mintbaseStoreAddress) => {
    const response = await axios.get(`https://mintbase-testnet.hasura.app/api/rest/stores/${mintbaseStoreAddress}`);
    const minters = response.data.store[0].minters;
    let isMinter = false;
    for(let i = 0; i < possibleWallets.length; i++) {
        for(let j = 0; j < minters.length; j++) {
            if(possibleWallets[i] == minters[j].account && minters[j].enabled) {
                isMinter = true;
            }
        }
    }

    return isMinter;
}

const getMintersForMintbaseStore = async (mintbaseStoreAddress) => {
    const response = await mintbaseAPI.fetchStoreById(mintbaseStoreAddress);
    const data = response.data;
    const store = data.store[0];
    const minters = store.minters;
    return minters;
}

const getUsernameByAccountId = async (accountId) => {
    const files = await readdir(".near-credentials/testnet", "utf-8");
    const username = files.filter(file => {
        return file.endsWith(`_${accountId}.json`);
    });
    return username[0].replace(`_${accountId}.json`, "");
}

const getMintsForMintbaseStore = async (mintbaseStoreAddress) => {
    const response = await mintbaseAPI.fetchStoreById(mintbaseStoreAddress);
    const data = response.data;
    const store = data.store[0];
    const mints = store.things;
    return mints;
}

const getMetadataByThingId = async (thingId) => {
    const response = await mintbaseAPI.fetchThingMetadata(thingId);
    const data = response.data;
    const thing = data;
    return thing;
}

const getNftfromNFTContractAddress = async (nftContract, accountId) => {
    const tx = await nftContract.nft_tokens_for_owner(
        {
            account_id: accountId
        }
    );
    return tx;
}

const transferNft = async (nftContract, receiver_id, token_id) => {
    const tx = await nftContract.nft_transfer({
        args: {
            token_id: token_id,
            receiver_id: receiver_id,
            memo: "transfer ownership"
        },
        amount: 1
    });
    return tx;
}

const daoContractInstance = (accountId) => {
    const daoContract = new nearAPI.Contract(
        accountId,
        SPUTNIK_DAO_ADDRESS,
        {
            viewMethods: ["get_proposals", "get_proposal", "get_last_proposal_id"],
            changeMethods: ["add_proposal"],
            sender: accountId
        }
    );
    return daoContract;
}

const addProposal = async (daoContract, description, receiverId) => {
    const tx = await daoContract.add_proposal({
        args: {
            proposal: {
                description,
                kind: {
                    Transfer: {
                        token_id: "",
                        receiver_id: receiverId,
                        amount: utils.format.parseNearAmount("1")
                    }
                }
            }
        },
        amount: utils.format.parseNearAmount("1")
    });

    return tx;
}

const getProposal = async (daoContract, proposalId) => {
    const proposal = await daoContract.get_proposal({
        id: parseInt(proposalId)
    });
    return proposal;
}

const getLastProposalId = async (daoContract) => {
    const id = await daoContract.get_last_proposal_id();
    return id;
}

const getProposals = async (daoContract) => {
    const id = await getLastProposalId(daoContract);
    const proposals = await daoContract.get_proposals({
        from_index: 0,
        limit: id
    });
    return proposals;
}

const checkDuplicateProposal = async (proposalDescription, proposals) => {
    const duplicateProposals = proposals.filter(proposal => {
        const proposalSplit = proposal.description.split("-");
        const proposalLink = proposalSplit[proposalSplit.length - 1];
        return proposalDescription.trim() == proposalLink.trim();
    });

    return duplicateProposals.length > 0;
}

module.exports = {
    isKeyAdded,
    addKeyPair,
    checkIfKeyPairExists,
    generateKeyPair,
    uploadToNFTStorage,
    nftContractInstance,
    nftMint,
    getImageURLFromMetadata,
    checkIfWalletEverConnected,
    checkIfPossibleWalletIsAMinter,
    getMintersForMintbaseStore,
    getUsernameByAccountId,
    getMintsForMintbaseStore,
    getMetadataByThingId,
    getNftfromNFTContractAddress,
    transferNft,
    daoContractInstance,
    addProposal,
    getProposal,
    getLastProposalId,
    getProposals,
    checkDuplicateProposal
}