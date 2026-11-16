import type { NavigatorScreenParams } from '@react-navigation/native';
import type { MainTabParamList } from '../../app/MainTabs';

/** What the Topics tab can be opened with: a subject (or exam) to filter by. */
export type TopicsFilterParams = { subjectId?: string; examId?: string };

/**
 * Params for `navigation.navigate('MainTabs', …)` that open the Topics tab
 * filtered to one subject (any status, so completed topics show too).
 */
export function topicsForSubject(
  subjectId: string,
): NavigatorScreenParams<MainTabParamList> {
  return { screen: 'Topics', params: { subjectId } };
}
