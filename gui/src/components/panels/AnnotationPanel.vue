<template>
  <BasePanel
    panel_id="annotation_panel"
    title="Selected Annotation"
    :collapsable="true"
    :collapsed="collapsed"
    @update:collapsed="emit('update:collapsed', $event)"
  >
    <template #content>
      <div class="annotation-panel-content">
        <MarkdownEditor
          :id-prefix="editorIdPrefix"
          :model-value="annotation.markdown"
          editor-label="Annotation content in Markdown"
          edit-button-label="Edit annotation content"
          save-button-label="Save annotation content"
          cancel-button-label="Cancel annotation editing"
          placeholder="Write an annotation with Markdown and LaTeX math…"
          empty-text="No annotation content yet."
          @update:model-value="updateMarkdown"
        />

        <fieldset class="annotation-settings">
          <legend>Appearance and area</legend>

          <label class="annotation-field" :for="backgroundColorId">
            <span>Background color</span>
            <input
              :id="backgroundColorId"
              type="color"
              :value="annotation.backgroundColor"
              @input="updateColor('backgroundColor', $event)"
            >
          </label>

          <label class="annotation-field" :for="borderColorId">
            <span>Border color</span>
            <input
              :id="borderColorId"
              type="color"
              :value="annotation.borderColor"
              @input="updateColor('borderColor', $event)"
            >
          </label>

          <label class="annotation-area-field" :for="attachAreaId">
            <input
              :id="attachAreaId"
              type="checkbox"
              :checked="annotation.area !== null"
              :aria-describedby="areaHelpId"
              @change="updateArea"
            >
            <span>Attach area selection</span>
          </label>
          <p :id="areaHelpId" class="annotation-field-help">
            Adds a transparent dashed area connected along an annotation edge.
          </p>
        </fieldset>

        <div class="annotation-delete-row">
          <AppButton
            variant="danger"
            aria-label="Delete selected annotation"
            @click="emit('delete', annotation, 'annotation')"
          >
            <template #icon>
              <Trash2 :size="15" />
            </template>
            Delete annotation
          </AppButton>
        </div>
      </div>
    </template>
  </BasePanel>
</template>

<script setup>
import { Trash2 } from '@lucide/vue'
import { useDomId } from '../../composables/useDomId'
import {
  attachAnnotationArea,
  detachAnnotationArea,
} from '../../utils/annotationGeometry.js'
import AppButton from '../ui/AppButton.vue'
import MarkdownEditor from '../ui/MarkdownEditor.vue'
import BasePanel from './BasePanel.vue'

const props = defineProps({
  annotation: {
    type: Object,
    required: true,
  },
  collapsed: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['delete', 'update:collapsed'])

const instanceId = useDomId('annotation-panel')
const editorIdPrefix = `annotation-content-${instanceId}`
const backgroundColorId = `annotation-background-${instanceId}`
const borderColorId = `annotation-border-${instanceId}`
const attachAreaId = `annotation-area-${instanceId}`
const areaHelpId = `annotation-area-help-${instanceId}`

function updateMarkdown(markdown) {
  Object.assign(props.annotation, { markdown })
}

function updateColor(field, event) {
  Object.assign(props.annotation, { [field]: event.target.value })
}

function updateArea(event) {
  const updatedAnnotation = event.target.checked
    ? attachAnnotationArea(props.annotation)
    : detachAnnotationArea(props.annotation)
  Object.assign(props.annotation, updatedAnnotation)
}
</script>

<style scoped>
.annotation-panel-content {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  color: var(--app-color-text);
}

.annotation-settings {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--app-space-4);
  min-width: 0;
  padding: var(--app-space-4);
  border: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-surface);
  background: var(--app-color-surface-subtle);
}

.annotation-settings legend {
  padding: 0 var(--app-space-1);
  font-size: 0.85rem;
  font-weight: 700;
}

.annotation-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--app-space-2);
  font-size: 0.82rem;
  font-weight: 600;
}

.annotation-field input[type="color"] {
  width: 100%;
  min-height: var(--app-control-height);
  padding: 2px;
  border: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-control);
  background: var(--app-color-surface);
}

.annotation-field input[type="color"]:focus-visible,
.annotation-area-field input:focus-visible {
  outline: var(--app-focus-ring-width) solid var(--app-color-focus);
  outline-offset: var(--app-focus-ring-offset);
}

.annotation-area-field {
  display: flex;
  grid-column: 1 / -1;
  align-items: center;
  gap: var(--app-space-2);
  font-size: 0.82rem;
  font-weight: 600;
}

.annotation-field-help {
  grid-column: 1 / -1;
  margin: calc(-1 * var(--app-space-3)) 0 0;
  color: var(--app-color-text-muted);
  font-size: 0.78rem;
}

.annotation-delete-row {
  display: flex;
  justify-content: flex-end;
  padding-top: var(--app-space-4);
  border-top: 1px solid var(--app-color-border);
}
</style>
