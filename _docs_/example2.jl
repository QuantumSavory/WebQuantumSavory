using QuantumSavory
using QuantumSavory.ProtocolZoo
using ConcurrentSim
using ResumableFunctions
using Graphs

import CairoMakie # to trigger the extension that has the `show` methods for mime image/png
import InteractiveUtils, REPL # to trigger the introspection extension

# Variety of confugartion options
# and setting up the various registers based on that configuration

sizes = [2,3,4,3]
R = length(sizes) # Number of registers


# All of the quantum register we will be simulating
registers = Register[]
for s in sizes

    # whether we have qubits or qumodes or something else
    traits = [Qubit() for _ in 1:s]

    # in principle we can have different representations -- this is something we have not discussed together yet, so just set this as the default (which is the case for the current constructor anyway)

    #!!! don't use the representation -- just use the constructor without representation for Register
    #!!! add the representation in. it's an instance of QuantumOpticsRepr() without arguments

    # representation = QuantumOpticsRepr # Representation to use for the qubits
    # repr = [representation() for _ in 1:s]

    # in principle below we can have different backgrounds for various qubits
    T2 = 6.5 # T2 dephasing times for the qubits, an argument to the constructor for the background
    bg = [T2Dephasing(T2) for _ in 1:s]

    # push!(registers, Register(traits,repr,bg))
    push!(registers, Register(traits,bg))
end

# A graph structure defining the connectivity among registers, in this case just a line graph
graph = grid([R])
network = RegisterNet(graph, registers; name = "my network", names=["A", "B", "C", "D"]) # A graph with extra "meta data"
# Above, the `name` and `names` arguments are completely unused in the actual simulator,
# but I added them here to keep the data model closer to what you have started setting up in the GUI.
# Name is for the network, names is for the registers.

# The scheduler datastructure for the discrete event simulation
sim = get_time_tracker(network)

##

protocols = [] # this list is not needed by the simulator itself, but I need it below to be able to call the `show` method for the protocols

# set up the entangler protocol with default config for each edge
for (;src, dst) in edges(network)
    eprot = EntanglerProt(sim, network, src, dst)
    push!(protocols, eprot)
    @process eprot() # this can be done just before the `run` command, no need to do it here, and no need to preserve the order
end
# set up the swapper protocol -- this requires support for more argument types than what we have available currently
for node in 2:R-1
    sprot = SwapperProt(sim, network, node; nodeL = <(node), nodeH = >(node), chooseL = argmin, chooseH = argmax)
    push!(protocols, sprot)
    @process sprot() # this can be done just before the `run` command, no need to do it here, and no need to preserve the order
end
# set up the entanglement tracker protocol
for node in vertices(network)
    tprot = EntanglementTracker(sim, network, node)
    push!(protocols, tprot)
    @process tprot() # this can be done just before the `run` command, no need to do it here, and no need to preserve the order
end
# set up the entanglement consumer protocol
cprot = EntanglementConsumer(sim, network, 1, R)
push!(protocols, cprot)
@process cprot()


# The UI should call repeatedly this run method so that it can query the state of the network at regular intervals and update the UI.
# E.g. if we want to run the simulation for 10 units of time, we should call run 10 times with growing second argument
run(sim, 1.0)
# then `run(sim, 2.0)` and so on
#run(sim, 2.0)
run(sim, 3.0)

@show now(sim) # current time

# introspection to get the state of the network, each register in the network, and each slot in each register

# loop over registers
for reg_idx in vertices(network)
    reg = network[reg_idx]
    println()
    println("########################################")
    @show reg_idx
    # loop over slots in the register
    for i in 1:nsubsystems(reg)
        println("--------------------------------")
        @show slot = reg[i]
        # this visible in the UI by default through what is already set up
        @show islocked(slot)
        @show isassigned(slot)
        @show reg.accesstimes[i]
        # this should be visible in the UI on request through the show method for mime text/html and image/png
        @show state = QuantumSavory.stateof(slot) # this contains both the domain-specific numeric object that represents the state of the slot, and the references to the slots that are entangled into it
        # if the slot has a state, it is potentially an entangled (a.k.a. correlated) state involving other slots of other registers
        if !isnothing(state)
            show(IOBuffer(), MIME"text/html"(), state)
            show(IOBuffer(), MIME"image/png"(), state)
            # the list below is something that should be visualized by highlighting all the slots entangled to currently selected slot
            @show slots = QuantumSavory.slots(state) # this contains the references to the slots that are entangled into the state
            # loop over the slots entangled into the state
            for s in slots
                # the index of the register in the network, the index of the slot in the register
                state_reg = QuantumSavory.parent(s)
                @show QuantumSavory.parentindex(state_reg), QuantumSavory.parentindex(s) # `parent` also exists, returning the object instead of its index
            end
        end
    end
end

# loop over protocols
for prot in protocols
    @show prot
    show(IOBuffer(), MIME"text/html"(), prot)
    show(IOBuffer(), MIME"image/png"(), prot)
end


# this is plotted just for debugging purposes and probably will not be part of the web GUI
registernetplot(network)


#=
Attached is the updated example file. It includes the API for getting html and png representations for various objects
through a show method with an appropriate mime type.

I believe there is one significant feature that is necessary for implementing the entirety of this example through the UI
    that we have not discussed yet. On line 56 where SwapperProt is instantiated it requires some complicated field types.
    Namely instances of

QueryArgs = Union{Int,Function,Wildcard}

and of

Function.

I do not have very good suggestions for how to implement these. I suggest the following, but I am open for better suggestions:

If the Union is encountered, the user first sees a drop down menu to select the concrete type and then inputs the instance of that type.
For Int it is just the already implemented int input. For Wildcard it is the singleton QuantumSavory.W.
For Function... for the moment I would suggest an unconstrained text input that then just gets eval-ed by the backend --
but that eval should happen in a context in which a few predefined variables are available, like `node` referring to the
node at which this protocol is being attached.
=#
