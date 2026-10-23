import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { NavigationAction } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import { saveDraft } from './draft';

export type PendingNavigation = NavigationAction | 'back' | null;
type RefCell<T> = { current: T };
type User = { id: string } | null;

type Options = {
  allowRemoval: boolean;
  savedRemotely: boolean;
  user: User;
  saving: boolean;
  picking: boolean;
  friend: string;
  amount: string;
  dueOn: string;
  receiptUri: string | null;
  submissionKey: string;
  active: RefCell<boolean>;
  navigationSaveBusy: RefCell<boolean>;
  pickerBusy: RefCell<boolean>;
  submitBusy: RefCell<boolean>;
  cancelDraftTimer: () => void;
  setFormError: Dispatch<SetStateAction<string>>;
  setDraftError: Dispatch<SetStateAction<string>>;
  setPendingNavigation: Dispatch<SetStateAction<PendingNavigation>>;
  setAllowRemoval: Dispatch<SetStateAction<boolean>>;
};

export function useDraftNavigationGuard(options: Options) {
  const navigation = useNavigation();
  const saveBusy = useRef(false);
  const {
    allowRemoval, savedRemotely, user, saving, picking, friend, amount,
    dueOn, receiptUri, submissionKey, active, navigationSaveBusy, pickerBusy, submitBusy,
    cancelDraftTimer, setFormError, setDraftError, setPendingNavigation,
    setAllowRemoval,
  } = options;

  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (allowRemoval) return;
    event.preventDefault();
    const action = event.data.action;
    if (savedRemotely) {
      setFormError('This entry is already saved. Finish clearing its local draft before leaving.');
      return;
    }
    if (!user) {
      setFormError('Your session is unavailable. Return to sign in before editing this entry.');
      setPendingNavigation(action);
      setAllowRemoval(true);
      return;
    }
    if (navigationSaveBusy.current) return;
    if (saving || picking || submitBusy.current || pickerBusy.current) {
      setFormError('Please wait for the current save or photo picker to finish before leaving.');
      return;
    }
    navigationSaveBusy.current = true;
    cancelDraftTimer();
    void saveDraft(user.id, { friendName: friend, amount, dueOn, receiptUri, submissionKey }).then((saved) => {
      if (!saved) {
        setDraftError('Device storage is unavailable. Your entry could not be saved before leaving.');
        navigationSaveBusy.current = false;
        return;
      }
      active.current = false;
      setPendingNavigation(action);
      setAllowRemoval(true);
    }).catch(() => {
      setDraftError('Device storage is unavailable. Your entry could not be saved before leaving.');
      navigationSaveBusy.current = false;
    });
  }), [navigation, allowRemoval, savedRemotely, user, saving, picking, friend, amount, dueOn, receiptUri, submissionKey,
    active, navigationSaveBusy, pickerBusy, submitBusy, cancelDraftTimer, setFormError, setDraftError, setPendingNavigation, setAllowRemoval]);

  return navigation;
}
