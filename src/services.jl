
function cleanup_stale_simulations_once()
    CLEANUP_THRESHOLD = 30

    # Get all simulation names to avoid mutating while iterating
    simulation_names = collect(keys(Cqn.STATE))
    
    for simulation_name in simulation_names
        try
            if haskey(Cqn.STATE, simulation_name)
                state = Cqn.STATE[simulation_name]
                
                # Skip if running or no last active time set
                if state.is_running || state.simulation_last_active_time === nothing
                    continue
                end
                
                # Check if older than 30 minutes
                if Dates.now() - state.simulation_last_active_time > Dates.Minute(CLEANUP_THRESHOLD)
                    @info "Destroying stale simulation: $simulation_name"
                    @log_event state Logging.Info "Simulation $simulation_name was purged due to inactivity"
                    
                    Cqn.destroy_simulation(simulation_name)
                end
            end
        catch e
            @error "Error cleaning up simulation $simulation_name" error=e
        end
    end
end

function cleanup_stale_simulations()
    CLEANUP_FREQUENCY = 60

    while true
        try
            sleep(CLEANUP_FREQUENCY)  # Wait 1 minute
            cleanup_stale_simulations_once()
        catch e
            @error "Error in background cleanup task" error=e
        end
    end
end