const {
    buildSchedulingEventsFromParams,
    calculateIntegratedScheduleParams,
    resolveSectionScheduleParams,
} = require('./periodCalculator');
const {
    buildOfflineSchedulePlan,
    shouldUseOfflineSchedule,
} = require('./offlineScheduleConfig');
const {
    buildRhythmOptionsFromConfig,
    resolveScheduleRhythm,
} = require('./scheduleRhythm');
const { resolveSectionClassType } = require('./sectionClassType');
const { resolveCourseSectioningProfile } = require('./sectioningTemplates');

function resolveCourseSchedulingEvents(course, classType, schedulingConfig = {}) {
    const rhythmOptions = buildRhythmOptionsFromConfig(schedulingConfig);
    const shiftDuration = rhythmOptions.shiftDuration;
    const profile = resolveCourseSectioningProfile(course);

    const offlinePlan = shouldUseOfflineSchedule(course, classType)
        ? buildOfflineSchedulePlan(course, shiftDuration, rhythmOptions.maxWeeks)
        : null;

    if (offlinePlan?.events?.length) {
        return {
            events: offlinePlan.events,
            scheduleParams: offlinePlan.params,
            schedulePlan: {
                mode: 'OFFLINE_SESSION',
                scheduleParams: offlinePlan.params,
                phases: [],
            },
            offlinePlan,
        };
    }

    const scheduleParams = profile.combinedLtTh
        ? calculateIntegratedScheduleParams(course, rhythmOptions.maxWeeks, shiftDuration)
        : resolveSectionScheduleParams(
            course,
            classType,
            shiftDuration,
            rhythmOptions.maxWeeks,
        );

    if (!scheduleParams?.numShifts) {
        return {
            events: [],
            scheduleParams: null,
            schedulePlan: null,
            offlinePlan: null,
        };
    }

    const schedulePlan = resolveScheduleRhythm(scheduleParams, rhythmOptions);
    const events = buildSchedulingEventsFromParams(
        scheduleParams,
        shiftDuration,
        rhythmOptions,
    );

    return {
        events,
        scheduleParams,
        schedulePlan,
        offlinePlan: null,
    };
}

function resolveSectionSchedulingEvents(section, schedulingConfig = {}) {
    const course = section?.course || {};
    const classType = resolveSectionClassType(section);
    return resolveCourseSchedulingEvents(course, classType, schedulingConfig);
}

module.exports = {
    resolveCourseSchedulingEvents,
    resolveSectionSchedulingEvents,
};
