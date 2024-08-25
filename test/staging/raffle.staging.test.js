const { network, deployments, getNamedAccounts, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { assert, expect } = require("chai")
const { accessListify } = require("ethers")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", function () {
          let Raffle, entranceFee, deployer, interval // 'ReferenceError: deployer is not defined' may be solved by declaring deployer outside of beforeEach just like here

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              // player = accounts[1];
              const RaffleDeployment = await deployments.get("Raffle")
              Raffle = await ethers.getContractAt(RaffleDeployment.abi, RaffleDeployment.address)
              // Raffle = RaffleContract.connect(player);

              entranceFee = await Raffle.getEntranceFee()
              interval = await Raffle.getInterval()
              console.log("1")
          })

          describe("fullfillRandomWords", function () {
              it("works with live Chainlink VRF and Chainlink Keepers, we get a random winner", async function () {
                  const startingTime = await Raffle.getLatestTimeStamp()
                  const accounts = await ethers.getSigners()
                  console.log("2")
                  await new Promise(async (resolve, reject) => {
                      Raffle.once("WinnerPicked", async () => {
                          console.log("WinnerPicked event fired!")
                          console.log("3")
                          try {
                              const RaffleState = await Raffle.getraffleState()
                              const recentWinner = await Raffle.getRecentWinner()
                              const winnerEndingBalance = await ethers.provider.getBalance(
                                  accounts[0].address,
                              )
                              const endingTimeStamp = await Raffle.getLatestTimeStamp()
                              console.log("4")
                              await expect(Raffle.getPlayers(0)).to.be.reverted
                              assert.equal(recentWinner.toString(), accounts[0].address)
                              assert.equal(RaffleState.toString(), "0")
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  (winnerStartingBalance + entranceFee).toString(),
                              )
                              assert(endingTimeStamp > startingTime)
                              console.log("5")
                              resolve()
                          } catch (error) {
                              console.log(error)
                              reject(error)
                          }
                      })
                      console.log("6")
                      const transaction = await Raffle.enterRaffle({
                          value: entranceFee,
                      })
                      await transaction.wait(1)
                      console.log("7")
                      const winnerStartingBalance = await ethers.provider.getBalance(
                          accounts[0].address,
                      )
                      console.log("Waiting for the event to emit!")
                      console.log("8")
                  })
              })
          })
      })
