<script setup>
import { ref, computed } from 'vue'
import { Pause, Play, Settings2, Square } from '@lucide/vue'
import { SimulationPhase } from '../../composables/simulationLifecycle.js'

const props = defineProps({
  projectData: {
    type: Object,
    required: true
  }, 
  backendSimulation: {
    type: Object,
    required: true
  },
  targetSimulationTime: {
    type: Number,
    required: true
  },
  pollingActive: {
    type: Boolean,
    required: true
  },
  phase: {
    type: String,
    required: true
  },
  capabilities: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['run', 'pause', 'resume', 'stop', 'prepareNetworkGraph', 'prepareSimulation'])

const showAdvancedControls = ref(false)

const currentTime = computed(() => {
  const sim = backendSim.value
  const time = sim.simulation_progress || 0
  
  const minutes = Math.floor(time / 60)
  const seconds = time % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`
})

// Backend simulation state (single source of truth)
const backendSim = computed(() => props.backendSimulation || {})

const isSimulationRunning = computed(() => props.phase === SimulationPhase.RUNNING)
const isSimulationPaused = computed(() => props.phase === SimulationPhase.PAUSED)

// Simplified progress calculation (using cumulative target time)
const simulationProgress = computed(() => {
  const sim = backendSim.value
  const targetTime = props.targetSimulationTime || sim.simulation_time
  
  if (!sim.simulation_progress || !targetTime) {
    return 0
  }
  
  const progress = (sim.simulation_progress / targetTime) * 100
  return Math.min(Math.round(progress), 100)
})

const canRunSimulation = computed(() => props.capabilities.canRun)
const canPauseSimulation = computed(() => props.capabilities.canPause)
const canResumeSimulation = computed(() => props.capabilities.canResume)
const canStopSimulation = computed(() => props.capabilities.canStop)

function handleRun() {
  emit('run')
}

function handlePause() {
  emit('pause')
}

function handleResume() {
  emit('resume')
}

function handleStop() {
  emit('stop')
}

function handlePrepareNetworkGraph() {
  emit('prepareNetworkGraph')
}

function handlePrepareSimulation() {
  emit('prepareSimulation')
}

function toggleAdvancedControls() {
  showAdvancedControls.value = !showAdvancedControls.value
}

</script>

<template>
  <div class="panel runner-panel" id="runnerPanel">
    <div class="panel-title">Simulation Runner</div>
    
    <!-- Current Time Display -->
    <div class="current-time-display">
      {{ currentTime }}
    </div>

        <!-- Simulation Progress (when running or paused) -->
        <div v-if="isSimulationRunning || isSimulationPaused" class="simulation-progress">
          <div class="progress-info">
            <span>
              {{ (backendSim.simulation_progress || 0).toFixed(3) }}s / {{ (targetSimulationTime || backendSim.simulation_time || 0).toFixed(3) }}s
            </span>
            <span>{{ simulationProgress }}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: simulationProgress + '%' }"></div>
          </div>
        </div>

    <!-- Main Controls -->
    <div class="main-controls">
      <div class="run-duration-group">
        <label>Run for</label>
        <div class="numeric-stepper">
          <input
            type="number"
            v-model.number="projectData.simulationConfig.time"
            step="0.001"
            min="0"
            class="duration-input"
            :disabled="isSimulationRunning || isSimulationPaused || pollingActive"
          />
          <span class="unit">sec</span>
        </div>
      </div>
      
      <div class="main-buttons">
        <button 
          class="settings-toggle-btn" 
          @click="toggleAdvancedControls"
          :class="{ active: showAdvancedControls }"
          title="Toggle advanced controls"
          :disabled="isSimulationRunning || isSimulationPaused || pollingActive"
        >
          <Settings2 :size="16" aria-hidden="true" />
        </button>
        
        <!-- Run/Pause/Resume/Stop buttons -->
        <button 
          v-if="!isSimulationRunning && !isSimulationPaused"
          class="run-btn" 
          :disabled="!canRunSimulation"
          @click="handleRun"
          :title="canRunSimulation ? 'Run simulation' : 'Define the simulation network before running it'"
        >
          <Play :size="16" aria-hidden="true" />
        </button>
        
        <button 
          v-if="canPauseSimulation"
          class="pause-btn" 
          @click="handlePause"
          title="Pause simulation"
        >
          <Pause :size="16" aria-hidden="true" />
        </button>
        
        <button 
          v-if="canResumeSimulation"
          class="resume-btn" 
          @click="handleResume"
          title="Resume simulation"
        >
          <Play :size="16" aria-hidden="true" />
        </button>
        
        <!-- Stop button hidden - behavior TBD with backend developer -->
        <button 
          class="stop-btn" 
          :disabled="!canStopSimulation"
          @click="handleStop"
          title="Stop simulation"
        >
          <Square :size="15" aria-hidden="true" />
        </button>
      </div>
    </div>

    <!-- Advanced Controls (Collapsible) -->
    <div class="advanced-controls" :class="{ visible: showAdvancedControls }">
      <div class="advanced-buttons">
        <button 
          :disabled="!props.capabilities.canPrepare || pollingActive"
          class="prepare-network-graph-btn" 
          @click="handlePrepareNetworkGraph"
        >
          Parse
        </button>
        <button 
          :disabled="props.phase !== SimulationPhase.PARSED || pollingActive"
          class="prepare-simulation-btn" 
          @click="handlePrepareSimulation"
        >
          Prepare
        </button>
        <button 
          :disabled="!props.capabilities.canPrepare || pollingActive"
          class="reset-btn" 
          @click="handlePrepareNetworkGraph"
          title="Reset simulation (re-parse network graph)"
        >
          Reset
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  background: white;
  border-radius: 8px;
  padding: 5px 16px 2px;
  box-shadow: 0 2px 4px rgba(66, 62, 112, 0.6);
}

.panel-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 5px;
  color: #333;
}

/* Current Time Display */
.current-time-display {
  font-size: 2rem;
  font-weight: 700;
  text-align: center;
  margin-bottom: 10px;
  color: #4345ac;
  font-family: 'Courier New', monospace;
  letter-spacing: 1px;
}

/* Simulation Progress */
.simulation-progress {
  margin-bottom: 16px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 4px;
  border: 1px solid #e9ecef;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 0.9rem;
  color: #555;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #e9ecef;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4345ac, #5a5cbf);
  transition: width 0.3s ease;
}

/* Main Controls */
.main-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.run-duration-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.run-duration-group label {
  font-weight: 500;
  color: #555;
}

.numeric-stepper {
  display: flex;
  align-items: center;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
}

.numeric-stepper input {
  border: none;
  outline: none;
  padding: 6px 2px;
  font-size: 0.9rem;
  width: 50px;
  text-align: right;
}

.numeric-stepper .unit {
  padding: 6px 8px;
  background: #f5f5f5;
  color: #666;
  font-size: 0.85rem;
  border-left: 1px solid #ddd;
}

.main-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-toggle-btn {
  background: none;
  border: 1px solid #4345ac;
  color: #4345ac;
  padding: 0px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
}

.settings-toggle-btn:hover {
  background: #4345ac;
  color: white;
}

.settings-toggle-btn.active {
  background: #4345ac;
  color: white;
}

.run-btn {
  background: #4345ac;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
}

.run-btn:hover:not(:disabled) {
  background: #2d2e70;
}

.run-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.pause-btn {
  background: #ffc107;
  color: #212529;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
}

.pause-btn:hover:not(:disabled) {
  background: #e0a800;
}

.resume-btn {
  background: #28a745;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
}

.resume-btn:hover:not(:disabled) {
  background: #218838;
}

.stop-btn {
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
}

.stop-btn:hover:not(:disabled) {
  background: #c82333;
}

/* Advanced Controls */
.advanced-controls {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease-out;
  border-top: 1px solid transparent;
  padding-top: 16px;
  display: none;
}

.advanced-controls.visible {
  max-height: 300px;
  transition: max-height 0.3s ease-in;
  border-top: 1px solid #eee;
  display: block;
}

.advanced-buttons {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.advanced-buttons button {
  flex: 1;
  border: 1px solid #4345ac;
  background: white;
  color: #4345ac;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.advanced-buttons button:hover:not(:disabled) {
  background: #4345ac;
  color: white;
}

.advanced-buttons button:disabled {
  background: #f5f5f5;
  color: #ccc;
  border-color: #ddd;
  cursor: not-allowed;
}


</style>
