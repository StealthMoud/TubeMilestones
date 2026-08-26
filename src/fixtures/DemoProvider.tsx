import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { DashboardData } from '../domain/models';
import {
  createDemoDashboard,
  demoFixtureFromLocation,
  demoScenarioFromLocation,
  isDemoModeAllowed,
  type DemoFixtureName,
  type DemoScenarioName,
} from './demoData';

interface DemoContextValue {
  data: DashboardData | null;
  scenario: DemoScenarioName | null;
  isDemo: boolean;
  setData(data: DashboardData | null): void;
  startDemo(name?: DemoFixtureName): void;
  exitDemo(): void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

function initialDemo(): {
  data: DashboardData | null;
  scenario: DemoScenarioName | null;
} {
  const requested = demoFixtureFromLocation();
  const scenario = demoScenarioFromLocation();
  if (!isDemoModeAllowed()) return { data: null, scenario: null };
  if (requested) return { data: createDemoDashboard(requested), scenario: null };
  if (!scenario) return { data: null, scenario: null };
  return {
    data:
      scenario === 'unconnected' || scenario === 'deletion-pending'
        ? null
        : createDemoDashboard(scenario === 'archive' ? 'growing' : 'small'),
    scenario,
  };
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(initialDemo);
  const [data, setData] = useState<DashboardData | null>(initial.data);
  const [scenario, setScenario] = useState<DemoScenarioName | null>(initial.scenario);
  const startDemo = useCallback((name: DemoFixtureName = 'small') => {
    if (isDemoModeAllowed()) {
      setScenario(null);
      setData(createDemoDashboard(name));
    }
  }, []);
  const exitDemo = useCallback(() => {
    setData(null);
    setScenario(null);
    window.location.hash = '#/';
  }, []);
  const value = useMemo(
    () => ({
      data,
      scenario,
      isDemo: data !== null || scenario !== null,
      setData,
      startDemo,
      exitDemo,
    }),
    [data, exitDemo, scenario, startDemo],
  );
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDemo(): DemoContextValue {
  const value = useContext(DemoContext);
  if (!value) throw new Error('useDemo must be used inside DemoProvider.');
  return value;
}
