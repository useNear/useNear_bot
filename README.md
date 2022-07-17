<h1 align="center">useNear</h1>

<p float="left" align="middle">
<img src="https://near.org/wp-content/uploads/2021/09/brand-stack-300x300.png" />
<img width="280" height="280" src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Telegram_logo.svg/512px-Telegram_logo.svg.png" />
</p>

<h3 align="center">useNear lets you access NEAR Protocol DApps using Telegram.</h3>

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


> Note: Development has been stopped.

## Roadmap
* Integrate more DApps (Paras, Ref Finance, LinkDrop, etc.
* Prepare Documentation so that anyone can integrate their own DApps with these bot.
