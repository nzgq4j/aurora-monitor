import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { Footer, Header, Toast } from './components/Chrome';
import { Account } from './screens/Account';
import { Checkout } from './screens/Checkout';
import { Home } from './screens/Home';
import { Plans } from './screens/Plans';
import { SignIn } from './screens/SignIn';
import { StoreProvider, useStore } from './store';

function App() {
  const { s } = useStore();
  // Each screen change starts at the top, as a page navigation would.
  useEffect(() => { window.scrollTo(0, 0); }, [s.screen]);
  return (
    <div className="app">
      <Header />
      <Toast />
      {s.screen === 'home' && <Home />}
      {s.screen === 'plans' && <Plans />}
      {s.screen === 'checkout' && <Checkout />}
      {s.screen === 'signin' && <SignIn />}
      {s.screen === 'account' && <Account />}
      <Footer />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
