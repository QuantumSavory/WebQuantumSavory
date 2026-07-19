
const AUTO_PURGE_MINUTES = 30
const AUTO_DESTROY_MINUTES = 300

function cleanup_stale_simulations_once()
    # Get all simulation names to avoid mutating while iterating
    simulation_names = WebQuantumSavory.simulation_names()
    
    for simulation_name in simulation_names
        try
            try
                state = WebQuantumSavory._simulation_state(
                    WebQuantumSavory.SIMULATION_SERVICE,
                    simulation_name,
                )
                
                # Skip if running or no last active time set
                if state.is_running || state.simulation_last_active_time === nothing
                    continue
                end

                # Check auto-destroy first (300 minutes) - applies to all simulations including purged ones
                if Dates.now() - state.simulation_last_active_time > Dates.Minute(AUTO_DESTROY_MINUTES)
                    @info "Auto-destroying stale simulation: $simulation_name"
                    @log_event state Logging.Info "Destroying simulation $simulation_name after $AUTO_DESTROY_MINUTES minutes of inactivity"
                    WebQuantumSavory.simulation_destroy!(simulation_name)
                    continue
                end
                
                # Skip auto-purge check if already purged or timed out
                if state.execution_time_exceeded || state.auto_purged
                    continue
                end
                
                # Check if older than AUTO_PURGE_MINUTES
                if Dates.now() - state.simulation_last_active_time > Dates.Minute(AUTO_PURGE_MINUTES)
                    @info "Auto-stopping stale simulation: $simulation_name"
                    @log_event state Logging.Info "Stopping simulation $simulation_name after $AUTO_PURGE_MINUTES minutes of inactivity"

                    # Non-destructive block to preserve state for UI
                    WebQuantumSavory.simulation_block!(
                        simulation_name;
                        reason=:autopurge,
                        max_minutes=AUTO_PURGE_MINUTES,
                        auto_purged=true,
                    )
                end
            catch error
                error isa WebQuantumSavory.APIError || rethrow()
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
