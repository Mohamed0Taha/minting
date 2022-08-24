import { useCallback, useEffect, useMemo, useState } from "react";
import confetti from "canvas-confetti";
import { Snackbar } from "@material-ui/core";
import nft1 from "./img/nft-1.png";
import nft2 from "./img/nft-2.png";
import nft3 from "./img/nft-3.png";
import nft4 from "./img/nft-4.png";
import logo from "./img/logo.png";
import welcome from "./img/welcome.png";
import wood from "./img/wood.png";
import pubicSale from "./img/public-sale.png";
import * as style from "./styles.js";
import * as anchor from "@project-serum/anchor";

import {
  Commitment,
  Connection,
  PublicKey,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { GatewayProvider } from "@civic/solana-gateway-react";
import Countdown from "react-countdown";
import Alert from "@material-ui/lab/Alert";
import { AlertState, getAtaForMint, toDate } from "./utils";
import { MintButton } from "./MintButton";
import {
  awaitTransactionSignatureConfirmation,
  CANDY_MACHINE_PROGRAM,
  CandyMachineAccount,
  createAccountsForMint,
  getCandyMachineState,
  getCollectionPDA,
  mintOneToken,
  SetupState,
} from "./candy-machine";
import { publicKey } from "@project-serum/anchor/dist/utils";
import axios from "axios";
const { createSecretKey } = require("crypto");

const cluster = process.env.REACT_APP_SOLANA_NETWORK!.toString();
const decimals = process.env.REACT_APP_SPL_TOKEN_TO_MINT_DECIMALS
  ? +process.env.REACT_APP_SPL_TOKEN_TO_MINT_DECIMALS!.toString()
  : 9;
const splTokenName = process.env.REACT_APP_SPL_TOKEN_TO_MINT_NAME
  ? process.env.REACT_APP_SPL_TOKEN_TO_MINT_NAME.toString()
  : "TOKEN";

export interface HomeProps {
  candyMachineId?: anchor.web3.PublicKey;
  connection: anchor.web3.Connection;
  txTimeout: number;
  rpcHost: string;
  network: WalletAdapterNetwork;
}

const Home = (props: HomeProps) => {
  const [balance, setBalance] = useState<number>();
  const [isMinting, setIsMinting] = useState(false); // true when user got to press MINT
  const [isActive, setIsActive] = useState(false); // true when countdown completes or whitelisted
  const [solanaExplorerLink, setSolanaExplorerLink] = useState<string>("");
  const [itemsAvailable, setItemsAvailable] = useState(0);
  const [itemsRedeemed, setItemsRedeemed] = useState(0);
  const [itemsRemaining, setItemsRemaining] = useState(0);
  const [isSoldOut, setIsSoldOut] = useState(false);
  const [payWithSplToken, setPayWithSplToken] = useState(false);
  const [price, setPrice] = useState(0);
  const [priceLabel, setPriceLabel] = useState<string>("SOL");
  const [whitelistPrice, setWhitelistPrice] = useState(0);
  const [whitelistEnabled, setWhitelistEnabled] = useState(false);
  const [isBurnToken, setIsBurnToken] = useState(false);
  const [whitelistTokenBalance, setWhitelistTokenBalance] = useState(0);
  const [isEnded, setIsEnded] = useState(false);
  const [endDate, setEndDate] = useState<Date>();
  const [isPresale, setIsPresale] = useState(false);
  const [isWLOnly, setIsWLOnly] = useState(false);
  const [ipAddress, setIpAddress] = useState("");
  const [tokenCount, setTokenCount] = useState(0);
  const [mintToggle, setMintToggle] = useState(0);

  const [alertState, setAlertState] = useState<AlertState>({
    open: false,
    message: "",
    severity: undefined,
  });

  const [needTxnSplit, setNeedTxnSplit] = useState(true);
  const [setupTxn, setSetupTxn] = useState<SetupState>();

  const wallet = useWallet();
  const [candyMachine, setCandyMachine] = useState<CandyMachineAccount>();

  const rpcUrl = props.rpcHost;
  const solFeesEstimation = 0.012; // approx of account creation fees

  const anchorWallet = useMemo(() => {
    if (
      !wallet ||
      !wallet.publicKey ||
      !wallet.signAllTransactions ||
      !wallet.signTransaction
    ) {
      return;
    }

    return {
      publicKey: wallet.publicKey,
      signAllTransactions: wallet.signAllTransactions,
      signTransaction: wallet.signTransaction,
    } as anchor.Wallet;
  }, [wallet]);

  const refreshCandyMachineState = useCallback(
    async (commitment: Commitment = "confirmed") => {
      if (!anchorWallet) {
        return;
      }

      const connection = new Connection(props.rpcHost, commitment);

      if (props.candyMachineId) {
        try {
          const cndy = await getCandyMachineState(
            anchorWallet,
            props.candyMachineId,
            connection
          );

          setCandyMachine(cndy);
          setItemsAvailable(cndy.state.itemsAvailable);
          setItemsRemaining(cndy.state.itemsRemaining);
          setItemsRedeemed(cndy.state.itemsRedeemed);
          getIpAddress();

          var divider = 1;
          if (decimals) {
            divider = +("1" + new Array(decimals).join("0").slice() + "0");
          }

          // detect if using spl-token to mint
          if (cndy.state.tokenMint) {
            setPayWithSplToken(true);
            // Customize your SPL-TOKEN Label HERE
            // TODO: get spl-token metadata name
            setPriceLabel(splTokenName);
            setPrice(cndy.state.price.toNumber() / divider);
            setWhitelistPrice(cndy.state.price.toNumber() / divider);
          } else {
            setPrice(cndy.state.price.toNumber() / LAMPORTS_PER_SOL);
            setWhitelistPrice(cndy.state.price.toNumber() / LAMPORTS_PER_SOL);
          }

          // fetch whitelist token balance
          if (cndy.state.whitelistMintSettings) {
            setWhitelistEnabled(true);
            setIsBurnToken(cndy.state.whitelistMintSettings.mode.burnEveryTime);
            setIsPresale(cndy.state.whitelistMintSettings.presale);
            setIsWLOnly(
              !isPresale &&
                cndy.state.whitelistMintSettings.discountPrice === null
            );

            if (
              cndy.state.whitelistMintSettings.discountPrice !== null &&
              cndy.state.whitelistMintSettings.discountPrice !==
                cndy.state.price
            ) {
              if (cndy.state.tokenMint) {
                setWhitelistPrice(
                  cndy.state.whitelistMintSettings.discountPrice?.toNumber() /
                    divider
                );
              } else {
                setWhitelistPrice(
                  cndy.state.whitelistMintSettings.discountPrice?.toNumber() /
                    LAMPORTS_PER_SOL
                );
              }
            }

            let balance = 0;
            try {
              const tokenBalance =
                await props.connection.getTokenAccountBalance(
                  (
                    await getAtaForMint(
                      cndy.state.whitelistMintSettings.mint,
                      anchorWallet.publicKey
                    )
                  )[0]
                );

              balance = tokenBalance?.value?.uiAmount || 0;
            } catch (e) {
              console.error(e);
              balance = 0;
            }
            if (commitment !== "processed") {
              setWhitelistTokenBalance(balance);
            }
            setIsActive(isPresale && !isEnded && balance > 0);
          } else {
            setWhitelistEnabled(false);
          }

          // end the mint when date is reached
          if (cndy?.state.endSettings?.endSettingType.date) {
            setEndDate(toDate(cndy.state.endSettings.number));
            if (
              cndy.state.endSettings.number.toNumber() <
              new Date().getTime() / 1000
            ) {
              setIsEnded(true);
              setIsActive(false);
            }
          }
          // end the mint when amount is reached
          if (cndy?.state.endSettings?.endSettingType.amount) {
            let limit = Math.min(
              cndy.state.endSettings.number.toNumber(),
              cndy.state.itemsAvailable
            );
            setItemsAvailable(limit);
            if (cndy.state.itemsRedeemed < limit) {
              setItemsRemaining(limit - cndy.state.itemsRedeemed);
            } else {
              setItemsRemaining(0);
              cndy.state.isSoldOut = true;
              setIsEnded(true);
            }
          } else {
            setItemsRemaining(cndy.state.itemsRemaining);
          }

          if (cndy.state.isSoldOut) {
            setIsActive(false);
          }

          const [collectionPDA] = await getCollectionPDA(props.candyMachineId);
          const collectionPDAAccount = await connection.getAccountInfo(
            collectionPDA
          );

          const txnEstimate =
            892 +
            (!!collectionPDAAccount && cndy.state.retainAuthority ? 182 : 0) +
            (cndy.state.tokenMint ? 66 : 0) +
            (cndy.state.whitelistMintSettings ? 34 : 0) +
            (cndy.state.whitelistMintSettings?.mode?.burnEveryTime ? 34 : 0) +
            (cndy.state.gatekeeper ? 33 : 0) +
            (cndy.state.gatekeeper?.expireOnUse ? 66 : 0);

          setNeedTxnSplit(txnEstimate > 1230);
        } catch (e) {
          if (e instanceof Error) {
            if (
              e.message === `Account does not exist ${props.candyMachineId}`
            ) {
              setAlertState({
                open: true,
                message: `Couldn't fetch candy machine state from candy machine with address: ${props.candyMachineId}, using rpc: ${props.rpcHost}! You probably typed the REACT_APP_CANDY_MACHINE_ID value in wrong in your .env file, or you are using the wrong RPC!`,
                severity: "error",
                hideDuration: null,
              });
            } else if (
              e.message.startsWith("failed to get info about account")
            ) {
              setAlertState({
                open: true,
                message: `Couldn't fetch candy machine state with rpc: ${props.rpcHost}! This probably means you have an issue with the REACT_APP_SOLANA_RPC_HOST value in your .env file, or you are not using a custom RPC!`,
                severity: "error",
                hideDuration: null,
              });
            }
          } else {
            setAlertState({
              open: true,
              message: `${e}`,
              severity: "error",
              hideDuration: null,
            });
          }
          console.log(e);
        }
      } else {
        setAlertState({
          open: true,
          message: `Your REACT_APP_CANDY_MACHINE_ID value in the .env file doesn't look right! Make sure you enter it in as plain base-58 address!`,
          severity: "error",
          hideDuration: null,
        });
      }
    },
    [
      anchorWallet,
      props.candyMachineId,
      props.rpcHost,
      isEnded,
      isPresale,
      props.connection,
    ]
  );

  const renderGoLiveDateCounter = ({ days, hours, minutes, seconds }: any) => {
    return (
      <div>
        <style.Card elevation={1}>
          <h1>{days}</h1>Days
        </style.Card>
        <style.Card elevation={1}>
          <h1>{hours}</h1>
          Hours
        </style.Card>
        <style.Card elevation={1}>
          <h1>{minutes}</h1>Mins
        </style.Card>
        <style.Card elevation={1}>
          <h1>{seconds}</h1>Secs
        </style.Card>
      </div>
    );
  };

  const renderEndDateCounter = ({ days, hours, minutes }: any) => {
    let label = "";
    if (days > 0) {
      label += days + " days ";
    }
    if (hours > 0) {
      label += hours + " hours ";
    }
    label += minutes + 1 + " minutes left to MINT.";
    return (
      <div>
        <h3>{label}</h3>
      </div>
    );
  };

  function displaySuccess(mintPublicKey: any, qty: number = 1): void {
    let remaining = itemsRemaining - qty;
    setItemsRemaining(remaining);
    setIsSoldOut(remaining === 0);
    if (isBurnToken && whitelistTokenBalance && whitelistTokenBalance > 0) {
      let balance = whitelistTokenBalance - qty;
      setWhitelistTokenBalance(balance);
      setIsActive(isPresale && !isEnded && balance > 0);
    }
    setSetupTxn(undefined);
    setItemsRedeemed(itemsRedeemed + qty);
    if (!payWithSplToken && balance && balance > 0) {
      setBalance(
        balance -
          (whitelistEnabled ? whitelistPrice : price) * qty -
          solFeesEstimation
      );
    }
    setSolanaExplorerLink(
      cluster === "devnet" || cluster === "testnet"
        ? "https://solscan.io/token/" + mintPublicKey + "?cluster=" + cluster
        : "https://solscan.io/token/" + mintPublicKey
    );
    setIsMinting(false);
    throwConfetti();
  }

  function throwConfetti(): void {
    confetti({
      particleCount: 400,
      spread: 70,
      origin: { y: 0.6 },
    });
  }

  const onMint = async (
    beforeTransactions: Transaction[] = [],
    afterTransactions: Transaction[] = []
  ) => {
    try {
      if (wallet.connected && candyMachine?.program && wallet.publicKey) {
        setIsMinting(true);
        let setupMint: SetupState | undefined;
        if (needTxnSplit && setupTxn === undefined) {
          setAlertState({
            open: true,
            message: "Please validate account setup transaction",
            severity: "info",
          });
          setupMint = await createAccountsForMint(
            candyMachine,
            wallet.publicKey
          );
          let status: any = { err: true };
          if (setupMint.transaction) {
            status = await awaitTransactionSignatureConfirmation(
              setupMint.transaction,
              props.txTimeout,
              props.connection,
              true
            );
          }
          if (status && !status.err) {
          
            setSetupTxn(setupMint);
            setAlertState({
              open: true,
              message:
                "Setup transaction succeeded! You can now validate mint transaction",
              severity: "info",
            });
          } else {
            setAlertState({
              open: true,
              message: "Mint failed! Please try again!",
              severity: "error",
            });
            return;
          }
        }

        const setupState = setupMint ?? setupTxn;
        const mint = setupState?.mint ?? anchor.web3.Keypair.generate();
        let mintResult = await mintOneToken(
          candyMachine,
          wallet.publicKey,
          mint,
          beforeTransactions,
          afterTransactions,
          setupState
        );

        let status: any = { err: true };
        let metadataStatus = null;
        if (mintResult) {
          status = await awaitTransactionSignatureConfirmation(
            mintResult.mintTxId,
            props.txTimeout,
            props.connection,
            true
          );

          metadataStatus =
            await candyMachine.program.provider.connection.getAccountInfo(
              mintResult.metadataKey,
              "processed"
            );
          console.log("Metadata status: ", !!metadataStatus);
        }

        if (status && !status.err && metadataStatus) {
          setAlertState({
            open: true,
            message: "Congratulations! Mint succeeded!",
            severity: "success",
          });

          // update front-end amounts
          createOrUpdate(ipAddress,wallet.publicKey,tokenCount)
          displaySuccess(mint.publicKey);
          refreshCandyMachineState("processed");
        } else if (status && !status.err) {
          setAlertState({
            open: true,
            message:
              "Mint likely failed! Anti-bot SOL 0.01 fee potentially charged! Check the explorer to confirm the mint failed and if so, make sure you are eligible to mint before trying again.",
            severity: "error",
            hideDuration: 8000,
          });
          refreshCandyMachineState();
        } else {
          setAlertState({
            open: true,
            message: "Mint failed! Please try again!",
            severity: "error",
          });
          refreshCandyMachineState();
        }
      }
    } catch (error: any) {
      let message = error.msg || "Minting failed! Please try again!";
      if (!error.msg) {
        if (!error.message) {
          message = "Transaction Timeout! Please try again.";
        } else if (error.message.indexOf("0x138")) {
        } else if (error.message.indexOf("0x137")) {
          message = `SOLD OUT!`;
        } else if (error.message.indexOf("0x135")) {
          message = `Insufficient funds to mint. Please fund your wallet.`;
        }
      } else {
        if (error.code === 311) {
          message = `SOLD OUT!`;
        } else if (error.code === 312) {
          message = `Minting period hasn't started yet.`;
        }
      }

      setAlertState({
        open: true,
        message,
        severity: "error",
      });
    } finally {
      setIsMinting(false);
    }
  };

  useEffect(() => {
    (async () => {
      if (anchorWallet) {
        const balance = await props.connection.getBalance(
          anchorWallet!.publicKey
        );
        setBalance(balance / LAMPORTS_PER_SOL);
        getIpAddress();
      }
    })();
  }, [anchorWallet, props.connection]);

  useEffect(() => {
    if (anchorWallet) {
      getRemaining(ipAddress, anchorWallet.publicKey, tokenCount);
    }

    refreshCandyMachineState();
  }, [
    anchorWallet,
    props.candyMachineId,
    props.connection,
    isEnded,
    isPresale,
    refreshCandyMachineState,
  ]);

  const getIpAddress = () => {
    axios({
      method: "get",
      url: "https://api.ipdata.co/?api-key=570e4d33cb83e2c324886218d3cca1a8cb8d65189429f4c62d077e2f",
      responseType: "stream",
    }).then(function (response) {
      console.log(response.data.ip);
      setIpAddress(response.data.ip);
    });
  };

  const getRemaining = (ip: string, pKey: any, tokens: number) => {
    const token = encrypt(ip, pKey, tokens);

    axios
      .post("http://tracker.unemployedvampires.wtf/user/find", { token: token })
      .then(function (response) {
        console.log(response.data);
        //check if there is result array not zero get first element and then tokencount
        if(response.data.length === 1){
          setTokenCount(response.data[0].tokenCount)
          
        }
      })
      .catch(function (error) {
        console.log(error);
      });
  };

    const createOrUpdate = (ip: string, pKey: any, tokens: number) => {
      const token = encrypt(ip, pKey, tokens);

      axios
        .post("http://tracker.unemployedvampires.wtf/user/new", { token: token })
        .then(function (response) {
          console.log(response.data);
          getRemaining(ipAddress, pKey, tokenCount);
          console.log(tokenCount)
        })
        .catch(function (error) {
          console.log(error);
        });
  };

  const encrypt = (ip: string, pKey: any, tokens: number) => {
    var jwt = require("jsonwebtoken");
    var token = jwt.sign(
      {
        publicKey: pKey,
        ipAddress: ip,
        tokenCount: tokens,
      },
      process.env.REACT_APP_SECRET
    );
    return token;
  };



 

  return (
    <main>
      <style.MainContainer>
        <style.WalletContainer>
          <style.Wallet>
            {wallet ? (
              <style.WalletAmount>
                {(balance || 0).toLocaleString()} SOL
                <style.ConnectButton />
              </style.WalletAmount>
            ) : (
              <style.ConnectButton>Connect Wallet</style.ConnectButton>
            )}
          </style.Wallet>
        </style.WalletContainer>
        <br />
        <style.MintContainer>
          <style.LeftContainer>
            <img src={welcome} alt="banner" className="banner" />
            <img src={logo} alt="banner" className="logo" />
            <img src={pubicSale} alt="banner" className="banner" />
            <div
              className="info-wrapper"
              style={{ backgroundImage: `url(${wood})` }}
            >
              <h3 className="info">
                Price:{" "}
                {isActive && whitelistEnabled && whitelistTokenBalance > 0
                  ? whitelistPrice + " " + priceLabel
                  : price + " " + priceLabel}
              </h3>
              {wallet &&
                isActive &&
                whitelistEnabled &&
                whitelistTokenBalance > 0 &&
                isBurnToken && (
                  <h3 className="info">
                    You own {whitelistTokenBalance} WL mint{" "}
                    {whitelistTokenBalance > 1 ? "tokens" : "token"}.
                  </h3>
                )}
              {wallet &&
                isActive &&
                whitelistEnabled &&
                whitelistTokenBalance > 0 &&
                !isBurnToken && (
                  <h3 className="info">
                    You are whitelisted and allowed to mint.
                  </h3>
                )}
              {wallet && isActive && endDate && Date.now() < endDate.getTime() && (
                <Countdown
                  date={toDate(candyMachine?.state?.endSettings?.number)}
                  onMount={({ completed }) => completed && setIsEnded(true)}
                  onComplete={() => {
                    setIsEnded(true);
                  }}
                  renderer={renderEndDateCounter}
                />
              )}
              {wallet && isActive && (
                <h3 className="info">
                  TOTAL MINTED : {itemsRedeemed} / {itemsAvailable}
                </h3>
              )}
            </div>
          </style.LeftContainer>
          <style.RightContainer>
            <div className="image-wrapper">
              <img src={nft1} alt="nft-sample" className="img" />
              <img src={nft2} alt="nft-sample" className="img" />
              <img src={nft3} alt="nft-sample" className="img" />
              <img src={nft4} alt="nft-sample" className="img" />
            </div>
            <style.MintButtonContainer>
              {!isActive &&
              !isEnded &&
              candyMachine?.state.goLiveDate &&
              (!isWLOnly || whitelistTokenBalance > 0) ? (
                <Countdown
                  date={toDate(candyMachine?.state.goLiveDate)}
                  onMount={({ completed }) =>
                    completed && setIsActive(!isEnded)
                  }
                  onComplete={() => {
                    setIsActive(!isEnded);
                  }}
                  renderer={renderGoLiveDateCounter}
                />
              ) : !wallet ? (
                <style.ConnectButton>Connect Wallet</style.ConnectButton>
              ) : !isWLOnly || whitelistTokenBalance > 0 ? (
                candyMachine?.state.gatekeeper &&
                wallet.publicKey &&
                wallet.signTransaction ? (
                  <GatewayProvider
                    wallet={{
                      publicKey:
                        wallet.publicKey ||
                        new PublicKey(CANDY_MACHINE_PROGRAM),
                      //@ts-ignore
                      signTransaction: wallet.signTransaction,
                    }}
                    // // Replace with following when added
                    // gatekeeperNetwork={candyMachine.state.gatekeeper_network}
                    gatekeeperNetwork={
                      candyMachine?.state?.gatekeeper?.gatekeeperNetwork
                    } // This is the ignite (captcha) network
                    /// Don't need this for mainnet
                    clusterUrl={rpcUrl}
                    cluster={cluster}
                    options={{ autoShowModal: false }}
                  >
                    <MintButton
                      candyMachine={candyMachine}
                      isMinting={isMinting}
                      isActive={isActive}
                      isEnded={isEnded}
                      isSoldOut={isSoldOut}
                      tokenCount={tokenCount}
                      onMint={onMint}
                    />
                  </GatewayProvider>
                ) : (
                  <MintButton
                    candyMachine={candyMachine}
                    isMinting={isMinting}
                    isActive={isActive}
                    isEnded={isEnded}
                    isSoldOut={isSoldOut}
                    onMint={onMint}
                    tokenCount={tokenCount}
                  />
                )
              ) : (
                <h1>Mint is private.</h1>
              )}
            </style.MintButtonContainer>
          </style.RightContainer>
        </style.MintContainer>
      </style.MainContainer>
      <Snackbar
        open={alertState.open}
        autoHideDuration={6000}
        onClose={() => setAlertState({ ...alertState, open: false })}
      >
        <Alert
          onClose={() => setAlertState({ ...alertState, open: false })}
          severity={alertState.severity}
        >
          {alertState.message}
        </Alert>
      </Snackbar>
    </main>
  );
};

export default Home;
