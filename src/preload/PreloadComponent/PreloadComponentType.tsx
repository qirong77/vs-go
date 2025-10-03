import { BrowserItem } from "../../main/electron/store";
interface ReactComponentBasicProps {
  style?: React.CSSProperties;
  className?: string;
}

export interface PreloadComponentProps extends ReactComponentBasicProps {}
export interface UrlToolBarProps {
  canGoBack: boolean;
  canGoForward: boolean;
  onNavigation: (action: 'back' | 'forward') => void;
  currentUrl: string;
  onUrlChange: (url: string) => void;
  onUrlSearch: (searchTerm: string) => void;
  historyList: BrowserItem[];
}

export interface NavigationButtonProps extends ReactComponentBasicProps {
  onClick: () => void;
  disabled?: boolean;
  icon: string | React.ReactElement;
  title: string;
}

export interface UrlInputProps extends ReactComponentBasicProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (searchTerm: string) => void;
  historyList: BrowserItem[];
}

export interface HistoryDropdownProps extends ReactComponentBasicProps {
  isVisible: boolean;
  historyList: BrowserItem[];
  onSelect: (url: string) => void;
  searchTerm: string;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
}