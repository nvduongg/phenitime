import { useRoutes } from 'react-router-dom'
import { appRoutes } from './config/routes'

function App() {
  return useRoutes(appRoutes)
}

export default App
