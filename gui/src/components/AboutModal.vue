<template>
  <div v-if="show" class="modal-overlay" @click="handleOverlayClick">
    <div
      class="modal-dialog about-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
      @click.stop
    >
      <div class="modal-header">
        <h3 id="about-title">About WebQuantumSavory Simulation Builder</h3>
        <button class="close-btn" @click="$emit('close')" aria-label="Close">
          <i class="pi pi-times"></i>
        </button>
      </div>

      <div class="modal-content">
        <section class="quantumsavory-feature" aria-labelledby="quantumsavory-title">
          <span class="feature-label">Powered by</span>
          <h4 id="quantumsavory-title">
            <a href="https://quantumsavory.org/" target="_blank" rel="noopener noreferrer">
              QuantumSavory
            </a>
          </h4>
          <p>
            WebQuantumSavory is an interactive builder for designing and running quantum-network
            simulations. Its simulation engine and reusable network protocols come from the
            QuantumSavory ecosystem for realistic quantum-network modeling.
          </p>
          <a
            class="feature-link"
            href="https://quantumsavory.org/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Explore QuantumSavory <span aria-hidden="true">&rarr;</span>
          </a>
        </section>

        <section class="about-section">
          <h4>Built with open-source tools</h4>
          <p>
            The
            <a href="https://julialang.org/" target="_blank" rel="noopener noreferrer">Julia</a>
            web service uses
            <a href="https://genieframework.com/" target="_blank" rel="noopener noreferrer">Genie</a>.
            The browser interface is built with
            <a href="https://vuejs.org/" target="_blank" rel="noopener noreferrer">Vue</a> and
            <a href="https://vite.dev/" target="_blank" rel="noopener noreferrer">Vite</a>, with
            <a href="https://primevue.org/" target="_blank" rel="noopener noreferrer">PrimeVue</a>
            components. The interactive map is rendered with
            <a
              href="https://maplibre.org/maplibre-gl-js/docs/"
              target="_blank"
              rel="noopener noreferrer"
            >MapLibre GL JS</a>.
          </p>
        </section>

        <section class="about-section">
          <h4>Created and supported by</h4>
          <p>
            The broader QuantumSavory project was created and is managed by the
            <a href="https://lab.krastanov.org/" target="_blank" rel="noopener noreferrer">
              Krastanov Lab
            </a>
            at the University of Massachusetts Amherst's
            <a href="https://www.cics.umass.edu/" target="_blank" rel="noopener noreferrer">
              Manning College of Information and Computer Sciences (CICS)</a>.
            It is developed with contributions from many volunteers.
          </p>
          <p>
            The development effort is supported by the
            <a href="https://cqn-erc.arizona.edu/" target="_blank" rel="noopener noreferrer">
              NSF Engineering and Research Center for Quantum Networks
            </a>
            and
            <a
              href="https://www.nsf.gov/awardsearch/show-award/?AWD_ID=2346089"
              target="_blank"
              rel="noopener noreferrer"
            >NSF Grant 2346089</a>,
            “Research Infrastructure: CIRC: New: Full-stack Codesign Tools for Quantum Hardware.”
          </p>
        </section>

        <section class="about-section community-section">
          <h4>Join the community</h4>
          <div class="community-links">
            <a
              class="community-link"
              href="https://quantumsavory.org/community/office-hours/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <i class="pi pi-comments" aria-hidden="true"></i>
              <span>
                <strong>Office hours</strong>
                <small>Ask questions and find current scheduling and joining details.</small>
              </span>
            </a>
            <a
              class="community-link"
              href="https://quantumsavory.org/community/bounties/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <i class="pi pi-code" aria-hidden="true"></i>
              <span>
                <strong>Bounty program</strong>
                <small>Contribute fixes and enhancements across the open-source ecosystem.</small>
              </span>
            </a>
          </div>
        </section>
      </div>

      <div class="modal-actions">
        <button class="btn-primary" @click="$emit('close')">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  show: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close'])

function handleOverlayClick() {
  emit('close')
}
</script>

<style scoped>
.about-modal {
  max-width: 700px;
  width: 90vw;
  max-height: 86vh;
  overflow: hidden;
}

.modal-header {
  display: flex;
  flex-shrink: 0;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #eee;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 600;
  color: #222;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  color: #666;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: #f5f5f5;
  color: #333;
}

.modal-content {
  min-height: 0;
  padding-right: 5px;
  overflow-y: auto;
}

.quantumsavory-feature {
  margin-bottom: 28px;
  padding: 24px;
  border: 1px solid #d9daf7;
  border-left: 5px solid #4345ac;
  border-radius: 8px;
  background: linear-gradient(135deg, #f6f6ff 0%, #fff 100%);
}

.feature-label {
  display: block;
  margin-bottom: 4px;
  color: #656791;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.quantumsavory-feature h4 {
  margin: 0 0 10px;
  font-size: 1.8rem;
  line-height: 1.2;
}

.quantumsavory-feature h4 a {
  color: #35379b;
  text-decoration: none;
}

.quantumsavory-feature h4 a:hover,
.quantumsavory-feature h4 a:focus-visible {
  text-decoration: underline;
}

.quantumsavory-feature p {
  margin: 0 0 14px;
  color: #464646;
  line-height: 1.6;
}

.feature-link {
  color: #35379b;
  font-weight: 600;
  text-decoration: none;
}

.feature-link:hover,
.feature-link:focus-visible {
  text-decoration: underline;
}

.about-section {
  margin-bottom: 25px;
}

.about-section h4 {
  margin: 0 0 10px;
  font-size: 1.1rem;
  font-weight: 600;
  color: #4345ac;
}

.about-section p {
  margin: 0;
  line-height: 1.65;
  color: #555;
}

.about-section p + p {
  margin-top: 10px;
}

.about-section p a {
  color: #35379b;
  font-weight: 500;
  text-underline-offset: 2px;
}

.community-section {
  margin-bottom: 0;
}

.community-links {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.community-link {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border: 1px solid #dedff0;
  border-radius: 7px;
  color: #35379b;
  text-decoration: none;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.community-link:hover,
.community-link:focus-visible {
  border-color: #7b7dcc;
  background: #f7f7ff;
}

.community-link i {
  margin-top: 2px;
  font-size: 1.15rem;
}

.community-link span {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.community-link small {
  color: #5c5c65;
  font-size: 0.86rem;
  line-height: 1.4;
}

.modal-actions {
  display: flex;
  flex-shrink: 0;
  justify-content: flex-end;
  margin-top: 20px;
  padding-top: 15px;
  border-top: 1px solid #eee;
}

@media (max-width: 600px) {
  .about-modal {
    width: calc(100vw - 24px);
    min-width: 0;
    padding: 20px 16px 16px;
  }

  .modal-header {
    align-items: flex-start;
    gap: 12px;
  }

  .quantumsavory-feature {
    padding: 18px;
  }

  .community-links {
    grid-template-columns: 1fr;
  }
}
</style>
