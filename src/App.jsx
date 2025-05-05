import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import VideoCallingApp from './VideoCallingApp'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <VideoCallingApp/>
    </>
  )
}

export default App
