# useNear - Gateway to all things NEAR

useNear lets you access NEAR Protocol DApps using Telegram.

## Current Supported (Not All Features)
* NFT
* Sputnik DAO
* Mintbase

## Tech Stack
* Telegram API & Telegraf
* Rust NFT Contract (NEP171 Compliant)
* NFT.Storage (Media & Metadata Storage)
* Mintbase SDK
* near-api-js

## Run Locally
* Get bot token from @botfather telegram.
* Get NFT.Storage API key
* Create .env file and put the token (`TELEGRAM_BOT_TOKEN`) and API key (`NFT_STORAGE_TOKEN`) there.
* Run the bot using `node bot.js`.

## Supported Commands
* /start - Connect Wallet
* /send - Send NEAR
* /getbalance - Get NEAR Balance
* /mintnft - Mint NFT using NFT.Storage
* /transfernft - Transfer NFT
* /setupmintbasegroup - Setup Group for Mintbase Minters only 
* /getminters - Get Minters for Mintbase Store
* /getmints - Get Things minted on the Mintbase Store
* /getmynfts - Get NFT's minted using NFT.Storage
* /addproposal - Add Proposal to Near Week Testnet Sputnik DAO
* /getproposal - Get Proposal from Near Week Testnet Sputnik DAO

## Roadmap
* Integrate more DApps (Paras, Ref Finance, LinkDrop, etc.
* Prepare Documentation so that anyone can integrate their own DApps with these bot.

### Bot Link - https://t.me/usenear_bot
### If bot doesn't respond possibly the server is down 😅 - Contact @jezeus on telegram.


