export function createSimulationControllerAdapter(controller) {
  return {
    prepare: () => controller.prepareSimulation(),
    run: duration => controller.runSimulationWithSteps(duration),
    pause: () => controller.pauseSimulation(),
    resume: () => controller.resumeSimulation(),
    reset: () => controller.stopSimulation(),
  }
}
