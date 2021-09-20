require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const nearAPI = require("near-api-js");

const { isKeyAdded, checkIfKeyPairExists, addKeyPair, generateKeyPair, uploadToNFTStorage, nftContractInstance, nftMint, getImageURLFromMetadata, checkIfWalletEverConnected, checkIfPossibleWalletIsAMinter, getMintersForMintbaseStore, getUsernameByAccountId, getMintsForMintbaseStore, getMetadataByThingId, getNftfromNFTContractAddress, transferNft, addProposal, daoContractInstance, getProposal, getProposals, checkDuplicateProposal } = require("./utils");
const { utils } = require("near-api-js");
const { connect, keyStores, KeyPair } = nearAPI;
const LocalSession = require("telegraf-session-local");


const keyStore = new keyStores.UnencryptedFileSystemKeyStore(".near-credentials");
let near;


const config = {
    networkId: "testnet",
    keyStore,
    nodeUrl: "https://rpc.testnet.near.org",
    walletUrl: "https://wallet.testnet.near.org",
    helperUrl: "https://helper.testnet.near.org",
    explorerUrl: "https://explorer.testnet.near.org"
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const bot = new Telegraf(BOT_TOKEN);

let TOKEN_ID = 0;

let chatIdToMintbaseStoreMapping = new Map();

// Session storage.
bot.use((new LocalSession({ database: "example_db.json "})).middleware());


bot.on("new_chat_members", async (ctx) => {
    const possibleWallets = await checkIfWalletEverConnected(ctx.message.from.username);
    if(possibleWallets.length > 0) {
        const mintbaseStoreAddress = chatIdToMintbaseStoreMapping.get(ctx.message.chat.id);
        let isMinter = await checkIfPossibleWalletIsAMinter(possibleWallets, mintbaseStoreAddress);
        if(isMinter) {
            bot.telegram.sendMessage(ctx.message.chat.id, `Welcome @${ctx.message.from.username}!`);
        } else {
            bot.telegram.sendMessage(ctx.message.chat.id, `@${ctx.message.from.username} is not a minter at ${mintbaseStoreAddress}`);
            ctx.kickChatMember(ctx.message.from.id, 0);
        }
    } else {
        bot.telegram.sendMessage(ctx.message.chat.id, "Please connect wallet with @tg_demo_v1_bot using private chat.");
        bot.telegram.sendMessage(ctx.message.chat.id, `@${ctx.message.from.id} was removed`);
        ctx.kickChatMember(ctx.message.from.id, 0);
    }
});

bot.command("/start", async (ctx) => {
    ctx.session.near = near;
    ctx.session.account = undefined;
    bot.telegram.sendMessage(ctx.chat.id, "<code>Welcome to useNear!</code>", {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: "Connect Wallet", callback_data: "connect" }]
            ]
        }
    });
})

// Bot hooks



bot.on("left_chat_member", (ctx) => {
    console.log("left");
})


// ACTIONS
bot.action("connect", async (ctx, next) => {
    ctx.deleteMessage();
    ctx.reply("Enter the wallet you wish to connect. (Only testnet support)", Markup.forceReply());
});

bot.action("connecting", (ctx) => {
    ctx.deleteMessage();
    ctx.reply("Enter the account you used to connect", Markup.forceReply());
})


bot.action(/news-category-([a-zA-z]+)/, async (ctx) => {
    if(ctx.update.callback_query.message.text == "Please select one of the category below"){
        const daoContract = daoContractInstance(ctx.session.account);
        const proposals = await getProposals(daoContract);
        const isDuplicate = await checkDuplicateProposal(ctx.session.proposalDescription, proposals);
        console.log(isDuplicate);
        if(isDuplicate) {
            ctx.reply("Duplicate Proposal. Make a new one using /addproposal");            
        } else {
            const tx = await addProposal(daoContract, `${ctx.session.newsTagLine} - ${ctx.match[1]} - ${ctx.session.proposalDescription}`, ctx.session.account.accountId);
            console.log(tx);
            const proposal = await getProposal(daoContract, tx);
            const message = `Proposal #${proposal.id}\nProposer: ${proposal.proposer}\nDescription: ${proposal.description}\nStatus: ${proposal.status}`;
            ctx.reply("Proposal added 🎉");
            bot.telegram.sendMessage(ctx.update.callback_query.message.chat.id, message, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "View on Sputnik DAO", url: `https://testnet-v2.sputnik.fund/#/near-week.sputnikv2.testnet/${proposal.id}`}]
                    ]
                }
            });
        }
        
        ctx.session.proposalDescription = null;
        ctx.session.newsTagLine = null;
    } else {
        ctx.reply("Start using /addproposal");
    }
})


// Reply Middleware
bot.use((ctx, next) => {
    if(ctx.message) {
        if(ctx.message.reply_to_message) {
            ctx.deleteMessage(ctx.message.reply_to_message.message_id);
            switch(ctx.message.reply_to_message.text) {
                case "Enter the wallet you wish to connect. (Only testnet support)":
                    (async () => {
                        await bot.telegram.sendChatAction(ctx.message.chat.id, "typing");
                        near = await connect(config);
                        console.log(ctx.message.chat.id);
                        const username = ctx.from.username;
                        const accountId = ctx.message.text;
                        const accountIdSplit = ctx.message.text.split(".");
                        const networkId = accountIdSplit[accountIdSplit.length - 1];
                        const result = await checkIfKeyPairExists(username, accountId);
                        if(result && isKeyAdded(near, accountId, JSON.parse(result).public_key)) {
                            const private_key = JSON.parse(result).private_key;
                            const keyStore = new keyStores.InMemoryKeyStore();
                            const keyPair = KeyPair.fromString(private_key);
                            await keyStore.setKey(networkId, accountId, keyPair);
                            config.keyStore = keyStore;
                            near = await connect(config);
                            let account = await near.account(accountId);
                            ctx.session.near = near;
                            ctx.session.account = account;
                            bot.telegram.sendMessage(ctx.message.chat.id, "<code>Connected 🤝 Use the menu to access DApps</code>", {
                                parse_mode: "HTML"
                            });
                        } else {
                            const keyPair = await generateKeyPair();
                            ctx.session.keyPair = keyPair;
                            const publicKey = keyPair.publicKey.toString();
                            bot.telegram.sendMessage(ctx.chat.id, "<code>Click the button below to connect wallet</code>", {
                                parse_mode: "HTML",
                                reply_markup: {
                                    inline_keyboard: [
                                        [{ text: "Allow Access", url: `https://wallet.testnet.near.org/login?title=tgbot&public_key=${publicKey}` }],
                                        [{ text: "Check Connection", callback_data: "connecting" }]
                                    ]
                                }
                            });
                        }
                    })();  
                    break;
                case "Enter the account you used to connect":
                    (async () => {
                        bot.telegram.sendChatAction(ctx.message.chat.id, "typing");
                        const accountId = ctx.message.text;
                        if(accountId && ctx.session.keyPair) {
                            let near = await connect(config);
                            console.log(accountId);
                            const keyAdded = await isKeyAdded(near, accountId, ctx.session.keyPair.publicKey);
                            console.log(keyAdded);
                            console.log(ctx.session.account);
                            if(keyAdded && ctx.session.account == undefined) {
                                let accountIdSplit = accountId.split(".");
                                let networkId = accountIdSplit[accountIdSplit.length - 1];
                                const private_key = await addKeyPair(ctx, networkId, accountId, ctx.session.keyPair);
                                const keyStore = new keyStores.InMemoryKeyStore();
                                const keyPair = KeyPair.fromString(private_key);
                                await keyStore.setKey(networkId, accountId, keyPair);
                                config.keyStore = keyStore;
                                near = await connect(config);
                                let account = await near.account(accountId);
                                ctx.session.near = near;
                                ctx.session.account = account;
                                console.log(ctx.session.account.connection.signer.keyStore);
                                bot.telegram.sendMessage(ctx.message.chat.id, "<code>Connected 🤝 Use the menu to access DApps</code>", {
                                    parse_mode: "HTML"
                                });
                            }
                        } else {
                            bot.telegram.sendMessage(ctx.message.chat.id, "Something went wrong! Please use /start",{
                                parse_mode: "HTML"
                            });
                        }
                    })();
                    break;
                case "Enter the accountId you want to send funds to":
                    const receipientAccountId = ctx.message.text;
                    ctx.session.receipientAccountId = receipientAccountId;
                    ctx.reply("Enter the amount to send (in NEAR)", Markup.forceReply());
                    break;
                case "Enter the amount to send (in NEAR)":
                    if(ctx.session.receipientAccountId) {
                        (async () => {
                            const amount = ctx.message.text;
                            await bot.telegram.sendChatAction(ctx.message.chat.id, "typing");
                            const tx = await ctx.session.account.sendMoney(
                                ctx.session.receipientAccountId,
                                utils.format.parseNearAmount(amount)
                            );
                            ctx.deleteMessage();
                            console.log(tx);
                            bot.telegram.sendMessage(ctx.chat.id, "<code>Transaction Completed!</code>", {
                                parse_mode: "HTML",
                                reply_markup: {
                                    inline_keyboard: [
                                        [{ text: "View in Explorer", url: `https://explorer.testnet.near.org/transactions/${tx.transaction.hash}` }]
                                    ]
                                }
                            })

                            ctx.session.receipientAccountId = null;
                        })();                        
                    } else {
                        bot.telegram.sendMessage(ctx.message.chat.id, "Start using /send or menu");
                    }
                    break;
                case "Enter the title of NFT":
                    if(ctx.session.account) {
                        ctx.session.nftTitle = ctx.message.text;
                        ctx.reply("Enter the description of the NFT", Markup.forceReply());
                        break;
                    } else {
                        bot.telegram.sendMessage(ctx.message.chat.id, "Account not connected!");
                    }
                case "Enter the description of the NFT":
                    if(ctx.session.account) {
                        if(ctx.session.nftTitle){
                            ctx.session.nftDesc = ctx.message.text;
                            ctx.reply("Upload the image file", Markup.forceReply());

                        } else {
                            bot.telegram.sendMessage(ctx.message.chat.id, "Start with /mintnft");
                        }
                    } else {
                        bot.telegram.sendMessage(ctx.message.chat.id, "Account not connected!");
                    }
                    break;
                case "Upload the image file":
                    if(ctx.message.photo) {
                        (async () => {
                            await bot.telegram.sendChatAction(ctx.message.chat.id, "typing");
                            let fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id
                            let link = await bot.telegram.getFile(fileId);
                            let actualLink = `https://api.telegram.org/file/bot${BOT_TOKEN}/${link.file_path}`;
                            let message = await ctx.reply("Uploading Metdata to IPFS...");
                            let url = await uploadToNFTStorage(ctx, ctx.session.nftTitle, ctx.session.nftDesc, actualLink);
                            let imageIPFSUrl = await getImageURLFromMetadata(url);
                            const nftContract = nftContractInstance(ctx.session.account);
                            bot.telegram.editMessageText(message.chat.id, message.message_id, "", "Minting NFT...");
                            const tx = await nftMint(nftContract, TOKEN_ID, ctx.session.account.accountId, ctx.session.nftTitle, ctx.session.nftDesc, imageIPFSUrl);
                            TOKEN_ID++;
                            bot.telegram.deleteMessage(message.chat.id, message.message_id);
                            bot.telegram.sendPhoto(ctx.message.chat.id, fileId, {
                                caption: "NFT Minted 🎉",
                                reply_markup: {
                                    inline_keyboard: [
                                        [{ text: "View in Collectibles", url: "https://wallet.testnet.near.org/?tab=collectibles" }],
                                        [{ text: "View metadata on IPFS", url: url }],
                                        [{ text: "View media on IPFS", url: tx.metadata.media }]
                                    ]
                                }
                            })

                            ctx.session.nftTitle = null;
                            ctx.session.nftDesc = null;
                            
                        })();
                    } else {
                        bot.telegram.sendMessage(ctx.message.chat.id, "Please upload a photo only");
                    }
                    break;
                case "Address of the mintbase store":
                    (async () => {
                        let mintbaseStoreAddress = ctx.message.text;
                        let isStoreAlreadySetup = chatIdToMintbaseStoreMapping.has(ctx.message.chat.id);
                        if(isStoreAlreadySetup) {
                            bot.telegram.sendMessage(ctx.message.chat.id, "Store already setup!");
                        } else {
                            await bot.telegram.sendChatAction(ctx.message.chat.id, "typing");
                            const possibleWallets = await checkIfWalletEverConnected(ctx.message.from.username);
                            const isMinter = await checkIfPossibleWalletIsAMinter(possibleWallets, mintbaseStoreAddress);
                            
                            if(isMinter) {
                                chatIdToMintbaseStoreMapping.set(ctx.message.chat.id, mintbaseStoreAddress);
                                bot.telegram.sendMessage(ctx.message.chat.id, `Bot will now kick everyone who is not part of ${mintbaseStoreAddress}. Group Setup Complete!`);
                            } else {
                                bot.telegram.sendMessage(ctx.message.chat.id, `You are not a minter for ${mintbaseStoreAddress}`);
                            }
                        }
                        
                    })();
                    break;
                case "Enter the token_id corresponding to the NFT you want to transfer":
                    let token_id = ctx.message.text;
                    ctx.session.nft_transfer_token_id = token_id;
                    ctx.reply("Enter the receiver accountId", Markup.forceReply());
                    break;
                case "Enter the receiver accountId":
                    (async () => {
                        if(ctx.session.nft_transfer_token_id) {
                            let receiver_id = ctx.message.text;
                            let nftContract = nftContractInstance(ctx.session.account);
                            await bot.telegram.sendChatAction(ctx.message.chat.id, "typing");
                            const tx = await transferNft(nftContract, receiver_id, ctx.session.nft_transfer_token_id);
                            bot.telegram.sendMessage(ctx.message.chat.id, "NFT transfer complete", {
                                reply_markup: {
                                    inline_keyboard: [
                                        [{ text: "View Collectibles", url: "https://wallet.testnet.near.org/?tab=collectibles" }]
                                    ]
                                }
                            });
                        } else {
                            bot.telegram.sendMessage(ctx.message.chat.id, "Something went wrong start with /transfernft");
                        }
                    })()
                    break;
                case "Please send the link to the contribution (Will cost 1 Ⓝ NEAR)":
                    const proposalDescription = ctx.message.text;
                    ctx.session.proposalDescription = proposalDescription;
                    ctx.reply("Please provide a tag line describing the news", Markup.forceReply());
                    break;
                case "Please provide a tag line describing the news":
                    const newsTagLine = ctx.message.text;
                    ctx.session.newsTagLine = newsTagLine;
                    bot.telegram.sendMessage(ctx.message.chat.id, "Please select one of the category below", {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: "DeFi", callback_data: "news-category-defi" }],
                                [{ text: "DAO", callback_data: "news-category-dao" }]
                            ]
                        }
                    });
                    break;                    
                case "Enter proposal ID":
                    (async () => {
                        const proposalId = ctx.message.text;
                        const daoContract = daoContractInstance(ctx.session.account);
                        const proposal = await getProposal(daoContract, proposalId);
                        const message = `Proposal #${proposal.id}\nProposer: ${proposal.proposer}\nDescription: ${proposal.description}\nStatus: ${proposal.status}`;
                        bot.telegram.sendMessage(ctx.message.chat.id, message, {
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: "View on Sputnik DAO", url: `https://testnet-v2.sputnik.fund/#/near-week.sputnikv2.testnet/${proposal.id}`}]
                                ]
                            }
                        });
                    })();
                    break;
            }
        }
    }
    next();
})



// bot.use(async (ctx, next) => {
//     console.log(ctx, ctx.session.account);
//     if(ctx.session.account) {
//         let accountIdSplit = ctx.session.account.accountId.split(".");
//         let networkId = accountIdSplit[accountIdSplit.length - 1];
//         let [accountId, private_key] = Object.entries(ctx.session.account.connection.signer.keyStore.keys)[0];
//         accountId = ctx.session.account.accountId;
//         const keyStore = new keyStores.InMemoryKeyStore();
//         const keyPair = KeyPair.fromString(private_key);
//         await keyStore.setKey(networkId, accountId, keyPair);
//         config.keyStore = keyStore;
//         near = await connect(config);
//         let account = await near.account(accountId);
//         ctx.session.near = near;
//         ctx.session.account = account;
//         next();
//     } else {
//         ctx.reply("Wallet not connected, use /start");
//     }
// });

// COMMANDS
bot.command("/send", (ctx) => {
    if(ctx.session.account) {
        ctx.reply("Enter the accountId you want to send funds to", Markup.forceReply());
    } else {
        ctx.reply("Wallet Not Connected, use /start");
    }
})

bot.command("/getbalance", async (ctx) => {
    if(ctx.session.account) {
        const details = await ctx.session.account.state();
        const message = `${ctx.session.account.accountId} Balance - ${utils.format.formatNearAmount(details.amount)}  Ⓝ`;
        ctx.reply(message);
    } else {
        ctx.reply("Wallet Not Connected, use /start");
    }
})

// NFT.Storage NFT
bot.command("/mintnft", (ctx) => {
    if(ctx.session.account) {
        ctx.reply("Enter the title of NFT", Markup.forceReply());
    } else {
        ctx.reply("Wallet Not Connected, use /start");
    }
});


bot.command("/transfernft", async (ctx) => {
    if(ctx.session.account) {
        const nftContract = nftContractInstance(ctx.session.account);
        await bot.telegram.sendChatAction(ctx.message.chat.id, "typing");
        let nfts = await getNftfromNFTContractAddress(nftContract, ctx.session.account.accountId);
        let message = `${ctx.session.account.accountId} owned NFTs: \n`;
        for(let i = 0; i < nfts.length; i++) {
            message += `${nfts[i].metadata.title} - ${nfts[i].token_id}\n`;
        }
        bot.telegram.sendMessage(ctx.message.chat.id, message);        
        ctx.reply("Enter the token_id corresponding to the NFT you want to transfer", Markup.forceReply());
    } else {
        ctx.reply("Wallet Not Connected, use /start");
    }
});


// Mintbase
bot.command("/setupmintbasegroup", async (ctx) => {
    if(ctx.message.chat.type == "supergroup") {
        await bot.telegram.sendChatAction(ctx.message.chat.id, "typing");
        const admins = await bot.telegram.getChatAdministrators(ctx.message.chat.id);
        let isAdmin = false;
        for(let admin of admins) {
            if(admin.user.id == ctx.message.from.id) {
                isAdmin = true;
                break;
            }
        }
        if(isAdmin) {
            const possibleWallets = await checkIfWalletEverConnected(ctx.message.from.username);
            if(possibleWallets.length > 0) {
                ctx.reply("Address of the mintbase store", Markup.forceReply());
            } else {
                bot.telegram.sendMessage(ctx.message.chat.id, "Please connect your wallet with @tg_demo_v1_bot using private chat.");
            }
        } else {
            bot.telegram.sendMessage(ctx.message.chat.id, "Only admin of the group can setup.");
        }
    } else {
        bot.telegram.sendMessage(ctx.message.chat.id, "This command is only applicable in a group chat!");
    }
});

bot.command("/getminters", async (ctx) => {
    if(ctx.message.chat.type == "supergroup") {
        const isStoreAlreadySetup = chatIdToMintbaseStoreMapping.has(ctx.message.chat.id);
        if(isStoreAlreadySetup) {
            let mintbaseStoreAddress = chatIdToMintbaseStoreMapping.get(ctx.message.chat.id);
            await bot.telegram.sendChatAction(ctx.message.chat.id, "typing");
            let minters = await getMintersForMintbaseStore(mintbaseStoreAddress);
            let message = `Minters for ${mintbaseStoreAddress}:\n`;
            for(let i = 0; i < minters.length; i++) {
                let username = await getUsernameByAccountId(minters[i].account);
                if(username == undefined) {
                    message += `${minters[i].account}`;
                } else {
                    message += `${minters[i].account} - @${username.toLowerCase()}`;
                }
                message += "\n";
            }
            bot.telegram.sendMessage(ctx.message.chat.id, message);
        } else {
            bot.telegram.sendMessage(ctx.message.chat.id, "Store not setup ask group owner to use /setupmintbasegroup command");
        }
    } else {    
        bot.telegram.sendMessage(ctx.message.chat.id, "This command is only applicable in a group chat!");
    }
})

bot.command("/getmints", async (ctx) => {
    if(ctx.message.chat.type == "supergroup") {
        const isStoreAlreadySetup = chatIdToMintbaseStoreMapping.has(ctx.message.chat.id);
        if(isStoreAlreadySetup) {
            let mintbaseStoreAddress = chatIdToMintbaseStoreMapping.get(ctx.message.chat.id);
            await bot.telegram.sendChatAction(ctx.message.chat.id, "typing");
            let mints = await getMintsForMintbaseStore(mintbaseStoreAddress);
            for(let i = 0; i < mints.length; i++) {
                let thing = await getMetadataByThingId(mints[i].id);
                let caption = `
                    Title: ${thing.title}\nDescription: ${thing.description}\n`;
                for(let prop in thing.extra) {
                    caption += `${prop.trait_type}: ${prop.value}\n`;
                }
                caption += `Available: ${thing.copies}`;
                bot.telegram.sendPhoto(ctx.message.chat.id, thing.media, {
                    caption: caption,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "View on Mintbase", url: `https://testnet.mintbase.io/thing/${mints[i].id}` }]
                        ]
                    }
                });
            }
        } else {
            bot.telegram.sendMessage(ctx.message.chat.id, "Store not setup ask group owner to use /setupmintbasegroup command");
        }
    } else {    
        bot.telegram.sendMessage(ctx.message.chat.id, "This command is only applicable in a group chat!");
    }
})

bot.command(["/getmynfts", "/flex"], async (ctx) => {
    if(ctx.session.account) {
        const nftContract  = nftContractInstance(ctx.session.account);
        await bot.telegram.sendChatAction(ctx.message.chat.id, "typing");
        const nfts = await getNftfromNFTContractAddress(nftContract, ctx.session.account.accountId);
        if(nfts.length == 0) {
            bot.telegram.sendMessage(ctx.message.chat.id, "No NFT found 🙁. Mint NFT using /mintnft");
        } else {
            for(let i = 0; i < nfts.length; i++) {
                let caption = ``;
                caption += `Owned by: ${nfts[i].owner_id}\n`;
                caption += `Title: ${nfts[i].metadata.title}\n`;
                caption += `Description: ${nfts[i].metadata.description}\n`;
                caption += `Copies: ${nfts[i].metadata.copies}`;
                bot.telegram.sendPhoto(ctx.message.chat.id, nfts[i].metadata.media, {
                    caption: caption
                })
            }
        }
    } else {    
        bot.telegram.sendMessage(ctx.message.chat.id, "Wallet Not Connected, use /start");
    }
});


// Sputnik DAO
bot.command("/addproposal", (ctx) => {
    if(ctx.session.account) {
        ctx.reply("Please send the link to the contribution (Will cost 1 Ⓝ NEAR)", Markup.forceReply());
    } else {
        ctx.reply("Wallet Not Connected, use /start");
    }
})

bot.command("/getproposal", (ctx) => {
    if(ctx.session.account) {
        ctx.reply("Enter proposal ID", Markup.forceReply());
    } else {
        ctx.reply("Wallet Not Connected, use /start");
    }
})

// bot.command("/getproposals", async (ctx) => {
//     const daoContract = daoContractInstance(ctx.session.account);
//     const proposals = await getProposals(daoContract);
//     let proposal = ctx.message.text.split(" ");
//     proposal = proposal[proposal.length - 1];
//     console.log(proposal);
//     let isDuplicate = await checkDuplicateProposal(proposal, proposals);
//     console.log(isDuplicate);
// })

bot.launch({
    webhook: {
        domain: "https://usenear.herokuapp.com/",
        port: Number(process.env.PORT)
    }
});