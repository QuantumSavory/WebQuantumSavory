(pwd() != @__DIR__) && cd(@__DIR__) # allow starting app from bin/ dir

using WebQuantumSavory
const UserApp = WebQuantumSavory
WebQuantumSavory.main()
