(pwd() != @__DIR__) && cd(@__DIR__) # allow starting app from bin/ dir

using Cqn
const UserApp = Cqn
Cqn.main()
