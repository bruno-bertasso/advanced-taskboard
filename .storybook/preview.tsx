import type { Preview } from '@storybook/react-vite'
import { NuqsAdapter } from 'nuqs/adapters/react'
import '../src/index.css'

const preview: Preview = {
  decorators: [
    (Story, ctx) => {
      document.documentElement.classList.toggle('dark', ctx.globals.theme === 'dark')
      return (
        <NuqsAdapter>
          <div className="h-[90vh] p-4">
            <Story />
          </div>
        </NuqsAdapter>
      )
    },
  ],
  globalTypes: {
    theme: {
      description: 'Tema',
      toolbar: { icon: 'mirror', items: ['light', 'dark'], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: 'light' },
  parameters: { a11y: { test: 'error' }, layout: 'fullscreen' },
}
export default preview
