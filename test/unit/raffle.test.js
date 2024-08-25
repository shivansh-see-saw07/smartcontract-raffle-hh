const { network, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { assert, expect } = require("chai")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", function () {
          let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, interval, deployer

          beforeEach(async () => {
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["all"])

              const raffleDeployment = await deployments.get("Raffle")
              raffle = await ethers.getContractAt("Raffle", raffleDeployment.address)

              const vrfCoordinatorV2MockDeployment = await deployments.get("VRFCoordinatorV2Mock")
              vrfCoordinatorV2Mock = await ethers.getContractAt(
                  "VRFCoordinatorV2Mock",
                  vrfCoordinatorV2MockDeployment.address,
              )

              raffleEntranceFee = await raffle.getEntranceFee()
              interval = await raffle.getInterval()
          })

          describe("Constructor", function () {
              it("initializes raffle correctly", async () => {
                  const raffleState = await raffle.getraffleState()

                  assert.equal(raffleState.toString(), "0")
                  assert.equal(
                      interval.toString(),
                      networkConfig[network.config.chainId]["keepersUpdateInterval"],
                  )
              })
          })

          describe("enterRaffle", function () {
              it("reverts when don't pay enough", async () => {
                  await expect(raffle.enterRaffle()).to.be.revertedWithCustomError(
                      raffle,
                      "Not__EnoughETHEntered",
                  )
              })

              it("records players when they enter", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const playerFromContract = await raffle.getPlayer(0)
                  assert.equal(playerFromContract.toString(), deployer.toString())
              })

              it("emits event on enter", async function () {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                      raffle,
                      "RaffleEnter",
                  )
              })

              it("It does not perform upkeep when calculating", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  await raffle.performUpkeep("0x")
                  await expect(
                      raffle.enterRaffle({ value: raffleEntranceFee }),
                  ).to.be.revertedWithCustomError(raffle, "Raffle__NotOpen")
              })
          })
          describe("checkUpkeep", function () {
              it("Returns False if people haven't sent any ETH", async () => {
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")
                  assert(!upkeepNeeded)
              })
              it("returns false if raffle isn't open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  await raffle.performUpkeep("0x")
                  const raffleState = await raffle.getraffleState()
                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")
                  assert.equal(raffleState.toString(), "1")
                  assert.equal(upkeepNeeded, false)
              })
              it("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) - 1])
                  await network.provider.send("evm_mine", [])
                  await raffle.performUpkeep("0x")
                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")
                  assert.equal(upkeepNeeded, false)
              })
              it("return true if enough time has passed, has players, ETH and is open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")
                  assert.equal(upkeepNeeded, true)
              })
          })
          describe("peformUpkeep", function () {
              it("it only runs if checkUpkeep returns true", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  const tx = await raffle.performUpkeep("0x")
                  assert(tx)
              })

              it("reverts if checkUpkeep returns false", async function () {
                  await expect(raffle.performUpkeep("0x")).to.be.revertedWithCustomError(
                      raffle,
                      "Raffle__UpkeepNotNeeded",
                  )
              })

              it("updates the raffle state, emits an event and calls the VRF Coordinator", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  const transactionResponse = await raffle.performUpkeep("0x")
                  const transactionReceipt = await transactionResponse.wait(1)

                  const requestId = transactionReceipt.logs[1].args.requestId
                  // before we emit an event on the line 'emit RequestedraffleWinner(requestId)', 'i_vrfCoordinator.requestRandomWords(...)' (continued on the next line)
                  // emits an event and we can get 'requestId' from the second event. Therefore we are using '1'st index instead of '0'th
                  const raffleState = await raffle.getraffleState()
                  assert(requestId > 0)
                  assert(Number(raffleState) == 1)
              })
          })
          describe("fulfillRandomWords", function () {
              beforeEach(async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
              })

              it("fulfillRandomWords can only be called after performUpkeep", async function () {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.target),
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.target),
                  ).to.be.revertedWith("nonexistent request")
              })

              it("picks a winner, resets the raffle and sends the money", async function () {
                  const additionalPlayers = 4
                  const startingAccountIndex = 2 // because 0th account is of the deployer, 1st account is of the player so we start with 2nd index
                  const accounts = await ethers.getSigners()
                  // after this loop, we are going to have 5 players
                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalPlayers;
                      i++
                  ) {
                      /*1*/ const accountConnectedWithraffle = raffle.connect(accounts[i])
                      await accountConnectedWithraffle.enterRaffle({
                          value: raffleEntranceFee,
                      })
                  }
                  const startingTimeStamp = await raffle.getLatestTimeStamp() // stores starting timestamp (before we fire our event)
                  // when we call 'performUpkeep()', we are acting as the chanilink keepers
                  // when we call 'fulfillRandomWords()', we are acting as the chainlink VRF
                  // we will have to wait for the 'fulfillRandomWords()' to be called

                  await new Promise(async (resolve, reject) => {
                      // when the WinnerPicked event emits, do some stuff in the async function
                      raffle.once("WinnerPicked", async () => {
                          console.log("Found the event!")
                          // assert throws an error if it fails, so we need to wrap
                          // it in a try/catch so that the promise returns event
                          // if it fails.
                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              console.log(`Winner: ${recentWinner}`)
                              const WinnerEndingBalance = await accounts[2].provider.getBalance(
                                  accounts[2].address,
                              )
                              const numberOfPlayers = await raffle.getNumberofPlayer()
                              const raffleState = await raffle.getraffleState()
                              const endingTimeStamp = await raffle.getLatestTimeStamp()
                              assert(endingTimeStamp > startingTimeStamp)
                              assert.equal(numberOfPlayers.toString(), "0")
                              assert.equal(raffleState.toString(), "0")
                              assert.equal(
                                  WinnerEndingBalance.toString(),
                                  (
                                      WinnerStartingBalance +
                                      raffleEntranceFee * ethers.toBigInt(additionalPlayers) +
                                      raffleEntranceFee
                                  ).toString(),
                              )
                              resolve() // if try passes, resolves the promise
                          } catch (e) {
                              reject(e) // if try fails, rejects the promise
                          }
                      })
                      // We are setting up the listener
                      // below, firstly we wil fire the event and then the above listener will pick it up and resolves it

                      const transaction = await raffle.performUpkeep("0x")
                      const transactionReceipt = await transaction.wait(1)
                      const WinnerStartingBalance = await accounts[2].provider.getBalance(
                          accounts[2].address,
                      )
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          transactionReceipt.logs[1].args.requestId,
                          raffle.target,
                      )
                  })
              })
          })
      })
