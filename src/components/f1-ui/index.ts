/** Kit F1+ UI: componentes del estándar visual F1+ (D1 a D18). No editar en el portal: se copia desde F1_UI_Kit. */
export const F1_UI_VERSION = '1.6.0';

export { cn } from './cn';
export { Button, IconButton, buttonClasses, type ButtonProps, type ButtonVariant, type ButtonSize, type IconButtonProps } from './Button';
export { ActionMenu, type MenuAction } from './ActionMenu';
export { Field, Input, Textarea, Select, SearchBox, controlClasses, type FieldProps } from './Field';
export { SearchableSelect, type SelectOption } from './SearchableSelect';
export { Checkbox, CheckboxRow, CheckboxGroup, type CheckboxProps } from './Checkbox';
export { Switch, SwitchRow, type SwitchProps } from './Switch';
export { Tabs, TabPanel, type TabItem, type TabsProps } from './Tabs';
export { Modal, type ModalProps } from './Modal';
export { ConfirmDialog, type ConfirmAction } from './ConfirmDialog';
export { ToastProvider, useToast, type ToastApi } from './Toast';
export { Alert, TONE, type Tone } from './Alert';
export { Badge } from './Badge';
export { PageHeader, EmptyState, type PageStat } from './PageHeader';
export { DataTable, type Column, type DataTableProps } from './DataTable';
export { DateRangeFilter, AppliedFilters, rangeLabel, type AppliedFilter } from './DateRangeFilter';
export { todayLocal, toIsoDate, formatDate, formatDateTime, presetRange, rangeError, inRange, PRESET_LABEL, type DateRange, type DatePreset } from './dates';
export { useTheme, applyTheme, readThemePreference, ThemePicker, THEME_BOOT_SCRIPT, type ThemePreference } from './theme';
export { F1Spinner, F1LoadingScreen, ButtonSpinner } from './F1Spinner';
export { GuideShell, GuideCols, RoleTags, Where, Flow, Steps, Bullets, Tip, Box, Faq, Glossary, Term, Ui, See, LearningPath, type GuideGroup, type GuideTopic, type GuideRoleTag, type GuideShellProps, type StepItem } from './Guide';
