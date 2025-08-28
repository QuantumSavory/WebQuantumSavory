using QuantumSavory
using QuantumSavory.ProtocolZoo # objects defined in this module need to be constructable from the UI
using QuantumSavory.StatesZoo # objects defined in this module need to be construtable from the UI
using Graphs
using ConcurrentSim


# Create a network

# generates a random regular graph with 4 nodes and 2 edges per node
# ex:
# 1 —— 2
# |     |
# 4 —— 3
the_network_graph = random_regular_graph(4,2)

# create a register for each node
# nv = number of vertices
# Register(n) creates a register with n qubits <- instantiates the nodes of the network
# Question: can we have different nodes configurations that would require using a different constructor? How would we do that?
nodes = [Register(rand(2:5)) for i in 1:nv(the_network_graph)]

# create a network from the graph and the registers
net = RegisterNet(the_network_graph, nodes)
sim = get_time_tracker(net)

# Manually do some operations on the network

# skip this for now
# some_custom_state = BarrettKokBellPair(0.9) # this needs to be constructable from the UI
# initialize!((net[1][1], net[2][1]), some_custom_state)
# end skip for now

# Set up some protocols to run on it

# note: we can get protocols as subtypes of AbstractProtocol

for (;src, dst) in edges(net) # assigning some protocols to edges of the graph (but there is currently no introspection method that can list what is attached to the vertex after the fact)
    prot = EntanglerProt(sim, net, src, dst) # this needs to be constructable from the UI
    @process prot() # launching the protocol //
end

for v in vertices(net) # assigning some protocols to nodes of the graph (but there is currently no introspection method that can list what is attached to the node after the fact)
    prot = EntanglementTracker(sim, net, v) # this needs to be constructable from the UI
    @process prot() # launching the protocol
end

# NOTE: launching the protocols should be done before the simulation is run for the first time
run(sim, 10) # running the simulation for 10 time unites

# below we list a few things that we might want to be able to do from the UI or see in the UI by default

@show net[1] # we can see that now most slots are occupied in node 1

@show net[2][1] # a reference to slot 1 of node 2

# there is no public API to list how states are connected yet

# this returns a scalar and we might want to be able to plot this scalar as a function of time as the sim evolves
bell_pair = Z1⊗Z1+Z2⊗Z2
# @show observable((net[1][1], net[2][1]), bell_pair)

@show islocked(net[1][1])

@show isassigned(net[1][1])


#=begin
next steps:
* create Register using Slots (by type, eg Qubit) and backgroundNoises -- there is a constructor for this taking lists of both types of objects
=#
