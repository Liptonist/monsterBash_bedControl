# A browser-based real-time bed management application for the aid stations of a large outdoor music festival: implementation with authentication, access control and audit logging, alongside paper vital-sign records

Yohei Sato<sup>1)</sup>, Konosuke Yamaguchi<sup>2)</sup>, Shigeki Kashimura<sup>3)</sup>

1) Ritsurin Hospital, Kagawa, Japan
2) Kagawa University Hospital, Kagawa, Japan
3) Kashimura Hospital, Shunpukai, Japan

**Correspondence:** [name, department, full postal address, e-mail]

**Running title:** Real-time bed management at a festival aid station

> **[Editorial note — delete before submission]** Target journal assumed to be *Acute Medicine & Surgery* (the English journal of the Japanese Association for Acute Medicine), Original Article. Author order does not yet reflect Dr Yamaguchi's suggestion. Romanisation of author names is provisional and must be confirmed.

---

## Abstract

**Aim** At a large outdoor music festival, several aid stations operate simultaneously, each with its own beds and chairs, and staff must share the severity and disposition of every patient in real time. We developed a bed management web application that runs entirely in a browser, requires no on-site server and no pre-installed application, and provides the access control and traceability expected of a medical record. We report its design, its security architecture and our operational experience, together with the problems that remain.

**Methods** The application is a static front end written in HTML, CSS and JavaScript, served from a static host, with a single cloud database (Firebase Realtime Database) as its only back end. The state of every bed, indoor chair and outdoor chair at four aid stations (vacant / minor / moderate / severe), together with the patient identifier, presenting complaint and a "awaiting escort" flag, is pushed to all devices over a persistent, event-driven connection. Users authenticate either with a Google account or with an e-mail address and password issued by an administrator; membership of a pre-registered allow-list, administrator privilege and the sign-in method are then verified. All three checks are enforced server-side by the database security rules. Every write operation is recorded automatically in an append-only audit log. Vital signs continued to be recorded by hand on the existing paper chart, which was linked to the electronic record by the patient identifier. Evaluation comprised operational performance during the festival, retrospective analysis of the audit log, and an anonymous questionnaire administered to physicians with experience of the previous paper-based workflow.

**Results** [To be completed after the festival in August 2026: event characteristics, patient numbers, system performance, measured synchronisation latency and questionnaire results.]

**Conclusions** [To be completed after the festival.]

**Keywords:** mass-gathering medicine; music festival; aid station; bed management; health information system

---

## Introduction

Outdoor music festivals attracting tens of thousands of visitors are now held frequently in Japan, and the aid stations serving them manage a wide range of presentations including heat illness, trauma and acute alcohol intoxication.<sup>1,2</sup> A mass gathering is defined as a large number of people assembled at a specific location for a specific purpose over a defined period; in Japan the threshold is conventionally taken as 1,000 people. Because presentations are distributed unevenly in both time and space, any one of the aid stations distributed across a venue may receive more patients than it can accommodate within a short period.<sup>3</sup>

In these circumstances a means is required to share, with minimal effort, (i) basic patient information (name, age, sex, presenting complaint and triage category), (ii) the availability of beds and chairs at each aid station, and (iii) the need for transfer to another aid station or to hospital. Conventionally, however, many aid stations manage occupancy using paper charts and verbal handover, which is prone to delay in sharing information between stations and between staff, to gaps in the record, and to misunderstanding at handover. Large festivals abroad have introduced electronic patient records and have reported retrospective analyses based on them,<sup>4</sup> but these presuppose an organised medical service and a dedicated information infrastructure, and cannot readily be transferred to aid stations run with limited staff and equipment, as is typical of events held outside major cities in Japan.

We developed a browser-based bed management web application (hereafter, the system) using a cloud database, and introduced it at the aid stations of a large outdoor festival. A design requirement was that it must operate without an on-site server and without any application installed in advance: participating staff simply open a URL in the browser of a device they already use. Because the system handles patient names, ages, sexes and presenting complaints, we also implemented user authentication, allow-list management and audit logging in response to the absence of access control and traceability identified during development.

We report the architecture of the system, its security design, the clinical workflow and the combined use of paper charts for vital signs, and we discuss both its usefulness and the problems that remain.

## Methods

### Setting and medical cover

The setting was a two-day outdoor music festival held in Kagawa Prefecture, Japan, in August 2026, with approximately 50,000 cumulative attendees. Four aid stations were distributed across the venue (headquarters, main stage, remote stage 1 and remote stage 2). The presentations anticipated were predominantly heat illness and trauma.

Medical cover comprised [n] physicians ([n] physician-shifts), [n] nurses ([n] nursing shifts) and [n] non-clinical staff-shifts. Weather conditions during the festival (minimum and maximum temperature, weather and any heat-illness warning) were also recorded.

> **[To be completed]** Staff numbers must be confirmed. Figure 1 currently carries placeholders for physician numbers; text and figure must be made consistent. Whether the festival and venue may be named depends on the organiser's permission; if permission is not granted, only the month and scale should be stated.

### The previous workflow (comparator)

Previously, one paper chart was used per patient. On arrival, the name, age, presenting complaint, vital signs, medical history and the contact details of any accompanying person were recorded, and the patient was assessed by a physician. Patients brought in by stretcher, and those requiring supine rest, were admitted to a bed (a single towel-sized area serving as one bed) for 30–60 minutes of rest, oral rehydration solution and, where appropriate, an over-the-counter medicine selected from those held on site. Patients not requiring supine rest, such as those with minor trauma, were managed seated on an indoor or outdoor chair. When symptoms had settled, the accompanying person, who had usually left the aid station, was asked to return and collect the patient. Where symptoms did not settle, the patient was advised to attend a nearby hospital or was transported by ambulance.

Under this workflow, the occupancy of each aid station existed only on its own paper records and whiteboard, and could be established from another station or from headquarters only by telephone or two-way radio.

### Design requirements

Four requirements were set: (i) no on-site server and no pre-installed application; (ii) no dependency on a coordinator or central control post, all devices having equal access to the same data; (iii) changes in the state of a bed or chair to be reflected on every device without any action by the user; and (iv) because medical personal information is handled, users must be restricted and every operation must be traceable afterwards.

### System architecture (Figure 1)

The system is a static web application requiring no server-side implementation. The front end consists solely of HTML, CSS and JavaScript (ES Modules) and is served from a static host; the back end is a Google Firebase Realtime Database, read and written directly from the browser through the Firebase SDK (Figure 1). Common functions — initialisation, authentication, allow-list checking, display of save status, audit logging and formatting of patient identifiers — are collected in a single module imported by each screen.

The system comprises five screens: (1) bed management, (2) discharge records, (3) archived records, (4) change history, and (5) user management (administrators only).

### Data model and screen design

Each aid station was given three types of slot: beds, indoor chairs and outdoor chairs. The initial configuration was 10 beds, 4 indoor chairs and 4 outdoor chairs per station, adjustable from the screen between 1 and 40 according to how the station had been set up. Each slot holds a patient identifier, name, age, sex, presenting complaint, triage category (vacant / minor / moderate / severe, shown by colour), time of admission and an "awaiting escort" flag. Slot identifiers are fixed within each station and are displayed as, for example, B3 (bed 3), CI2 (indoor chair 2) and CO1 (outdoor chair 1).

Patient identifiers take the form year–festival day–three-digit serial number (for example, 2026-1-001) and are allocated by a server-side transaction, so that simultaneous registrations from several devices cannot receive the same number. The year is omitted on screen to reduce clutter. To support a two-day festival, an administrator performs an end-of-day close after the first day: the day's discharge records are moved to the archive, the serial number is reset to 1, and the festival day is incremented. These four operations are committed as a single update, so a loss of connectivity cannot leave them partially applied.

Time since admission is displayed continuously in each slot and changes to amber at 20 minutes and to red at 30 minutes, making it possible to see at a glance which patients have exceeded the usual 30–60 minute period of rest.

The principal data nodes are shown in Table 1.

### Real-time synchronisation (Figure 2)

Polling is not used. A persistent, event-driven connection detects any write immediately and pushes the difference to every subscribed device (Figure 2). When a physician registers or updates patient information (STEP 1), the database detects the change (STEP 2) and the screens of all devices, including those at the other three aid stations, are redrawn automatically (STEP 3). No manual refresh is required.

Until a write has been committed on the server, "saving" is displayed at the foot of the screen, changing to "saved" on commit. An attempt to navigate to another screen while a write is outstanding is deferred until the write commits, and an attempt to close the browser raises a warning. A device that loses connectivity continues to display its local cache and re-synchronises automatically on reconnection.

### Clinical workflow (Figure 3)

The workflow for each patient has three stages: admission and triage, change of status or transfer, and discharge (Figure 3).

1. **Admission and triage.** A vacant bed or chair is selected and the triage category, name, age, sex and presenting complaint are entered. A patient identifier is allocated only when a slot is filled from the vacant state.
2. **Change of status or transfer.** A change of triage category, a move between bed and chair, or a transfer to another aid station is made while the patient identifier is retained. The write to the destination slot and the clearing of the source slot are committed as a single update, so the patient can never appear in both slots at once or disappear from both. Patients fit for discharge who are waiting for an accompanying person are flagged as awaiting escort.
3. **Discharge.** The time of discharge (defaulting to the current time) is confirmed; the length of stay is then calculated automatically, a discharge record is stored, and the slot returns to vacant.

A discharge record entered in error can be moved to a recycle bin and restored from it. Permanent deletion is restricted to administrators.

### Authentication, access control and audit logging

Because the system handles medical personal information, the following layered access control was implemented (Figure 1, authentication layer).

**Authentication.** Firebase Authentication was used, offering both Google account sign-in and sign-in with an e-mail address and password issued by an administrator. The former suits staff who hold a personal Google account; the latter suits those who do not, or who do not wish to use a Google account on a work device. Passwords are held by Firebase Authentication and are not stored in the database. A user who forgets a password can request a reset e-mail from the sign-in screen.

**Allow-list.** Independently of successful authentication, the e-mail address must be present in a pre-registered allow-list, which also holds the display name and an administrator flag. Addition to and removal from the list, creation of password accounts, and password changes and resets are performed by administrators from a dedicated screen.

**Separation of privileges.** Changing the festival year and day, performing the end-of-day close, creating archived records, permanently deleting discharge records and managing users are restricted to administrators. General users may view and edit bed information and may add and logically delete discharge records.

**Verification of sign-in method.** Where e-mail and password authentication is enabled, a third party can create credentials for an arbitrary e-mail address using the publicly readable API key. An address that is on the allow-list but has never been used to sign in can therefore be claimed by a third party, with serious consequences if the address holds administrator privilege. To prevent this, only accounts that either signed in with Google or have a record in the allow-list showing that an administrator created them with a password are accepted. This check is implemented both in the application and in the database security rules.

**Server-side enforcement.** Controls in the user interface alone cannot prevent direct access to the database that bypasses the interface, and are therefore not a defence. All of the checks above are enforced server-side by the database security rules. Each user may read only their own entry in the allow-list; only administrators may read the list in full, with an exception, used only for initial configuration, while the list is empty.

**Audit logging.** Registration, editing, discharge, transfer, changes to the number of slots, recycle-bin operations, addition and removal of users, and the end-of-day close are all recorded automatically with the time, the identifier and display name of the user, the type of operation, the target slot and the content. The log is append-only: no user can alter or delete an existing entry, and the server verifies that the e-mail address recorded matches that of the authenticated user. The change-history screen allows filtering by user, type of operation and free text.

Before authentication was implemented, anyone who knew the URL and the database connection details could read and edit patient information, and there was no means of establishing who had changed what and when. The operation reported here began only after the implementation described above was complete.

### Combined use of the paper chart

The system does not record serial vital signs. The existing paper chart was therefore retained for hand-written blood pressure, pulse, oxygen saturation and temperature, and the patient identifier allocated by the system was written on it. The electronic record thus provides an overview of occupancy and severity, while the paper record provides the serial physiological and clinical record, the two being linked by the patient identifier.

### Outcome measures

**System performance.** Whether all devices at the four aid stations shared the same data and reflected each other's changes; the latency between a write and the update of all screens; the total number of operations during the festival and their distribution by type; the number of writes that failed to commit; and the consistency between discharge records and the audit log. Latency will be measured [n] times between two time-synchronised devices, from the write operation to the update of the display on the second device, and reported as the median and interquartile range. The remaining measures derive from retrospective analysis of the audit log.

**Patient measures.** Numbers of patients by aid station and triage category, distribution of presenting complaints, length of stay, numbers of transfers between slots and stations, and numbers referred to hospital or transported by ambulance.

**User evaluation.** Physicians with experience of the previous workflow will receive an anonymous questionnaire on the day after the festival, with responses requested within one week. The items are shown in Table 2: comparison with the previous workflow (Q1–Q6), features of the system (Q7–Q11), and operational obstacles (Q12–Q16), each answered on a five-point Likert scale (1, strongly disagree, to 5, strongly agree), together with free-text items.

### Statistical analysis

Questionnaire responses will be summarised as the median and interquartile range for each item, with the proportion of favourable responses (4 or 5). Stratified analysis by previous experience will be undertaken if the number of responses permits. Continuous variables such as latency will be reported as the median and interquartile range.

### Ethics

The study was approved by the research ethics committee of [institution] (reference: [number]). It is an observational study involving secondary analysis of information recorded in the course of routine aid-station activity; no additional intervention was performed. Names were removed before analysis and records were anonymised by patient identifier in a manner that does not permit re-identification. The questionnaire was anonymous, and the covering letter stated that return of a completed questionnaire would be taken as consent.

## Results

> **[This section is to be completed after the festival in August 2026. The headings below indicate the intended structure; no values have yet been obtained.]**

### Event and patients

Cumulative attendance over the two days was [n], and [n] patients attended the aid stations ([n] on day 1 and [n] on day 2). By station, the numbers were [n] at headquarters, [n] at the main stage, [n] at remote stage 1 and [n] at remote stage 2. By triage category there were [n] minor, [n] moderate and [n] severe presentations; presenting complaints comprised heat illness in [n], trauma in [n] and other conditions in [n]. Median length of stay was [n] minutes (interquartile range [n]–[n]). There were [n] transfers between aid stations, [n] referrals to hospital and [n] ambulance transports. The maximum temperature during the festival was [n] °C.

### System performance

[n] devices across the four aid stations operated while sharing a single database. All devices had equal access to occupancy data, and no coordinator or central control post was required. Each patient was tracked from admission to discharge under a single identifier.

Median latency from a write to the update of the display on another device was [n] ms (interquartile range [n]–[n]). Connectivity was lost on [n] occasions, in each case [detail]. [n] writes failed to commit.

### Audit log and completeness of the record

[n] operations were recorded in the audit log: [n] registrations, [n] edits, [n] transfers, [n] discharges, [n] changes to slot numbers and [n] other operations. On subsequent reconciliation, [n] discharge records and [n] discharge operations in the audit log were [consistent / discrepant]. Note that only operations that pass authentication and the allow-list check can be written to the audit log; the number of failed authentication attempts and of access attempts by users absent from the allow-list therefore cannot be obtained from it.

### Questionnaire

Questionnaires were distributed to [n] physicians and [n] were returned (response rate [n]%). The distribution of responses is shown in Table 3. The items with the highest proportion of favourable responses were [items]; those with the lowest were [items]. Free-text responses included [content].

## Discussion

> **[The summary of results below is to be written once the results are available.]**

### Summary of principal findings

[Describe, objectively, which items were rated favourably and which were not, and then what worked and what did not.]

### A horizontal information-sharing structure

In mass-gathering medicine, capacity to receive patients is geographically fixed while presentations are not, and the mismatch is a recurring problem.<sup>3</sup> By having several aid stations share a single database on equal terms, the system makes pressure at one station immediately visible as availability elsewhere. Because no coordinator or central control post is presupposed, the arrangement suits events staffed by small teams. Under the previous workflow, availability at another station could be established only by telephone or radio; with the system, the screen at every station updates automatically and the enquiry itself becomes unnecessary.

### A design that requires no prior installation

Because the front end consists only of static files served from a static host, staff need only open a URL. No installation through an application store, no on-site server and no special configuration of the venue network is required. Given that an aid station is staffed for a single event by a group of clinicians assembled for the occasion, the absence of any setup or decommissioning burden is a substantial practical advantage. The design does, however, depend entirely on connectivity at the venue.

### Access control and traceability

In its early form the system had no user authentication: anyone who knew the URL and the connection details could read and edit patient information, and there was no way to establish who had changed what and when. This was not acceptable for a record of clinical activity, and authentication, allow-list checking, separation of privileges and audit logging were implemented before the operation reported here.

Two aspects of the implementation deserve emphasis. First, the checks are enforced by server-side security rules. Controls in the user interface alone do not prevent direct access to the database and are therefore not a defence. Second, the sign-in method is verified. Enabling e-mail and password authentication allows a third party to create credentials for an arbitrary address using the publicly readable API key, so that an address on the allow-list that has never been used to sign in can be claimed — a particular risk for addresses holding administrator privilege. This route did not exist before authentication was added: introducing authentication itself created a new attack surface, which we consider an instructive result in its own right.

The audit log is append-only and the identity of the recording user is verified server-side, so it can support case aggregation and the investigation of incidents. Under a purely paper-based workflow it is difficult to establish retrospectively who recorded what and when, and this is a clear advantage of the system.

The log has an important limitation, however. Only operations that pass both authentication and the allow-list check are recorded; failed authentication attempts, and attempts by users who are not on the allow-list, are rejected by the security rules and therefore leave no trace in the log. The log is a record of what authorised users did, not of who was refused. Establishing the latter requires the logs held by the authentication service itself.

A mechanism to verify that a request originates from the genuine application (such as an app-attestation service) has not been implemented, so direct access using the public API key from a script remains possible for an authenticated user. Such a layer would not, however, constrain what a legitimate user may do; that remains the role of access control and audit logging. Authentication also imposes a new burden — signing in, and issuing and withdrawing accounts — and the balance between that burden and the protection obtained should be judged against the questionnaire results.

### Two-layer operation with the paper chart

The system is confined to an overview of occupancy and severity and does not record serial vital signs, so the paper chart was retained and linked by patient identifier. This is a pragmatic way of limiting the scope of development, but it leaves undefined which record takes precedence when the two disagree — for example, when a change of triage category on the system is not carried over to the paper chart, or the reverse. Transcription of the identifier is itself a source of error; reading it from a two-dimensional barcode would remove the transcription step and reduce errors.

### Problems that remain

**Loss of unsent operations offline.** A banner indicates loss of connectivity, but unsent operations are retained only while the page remains open. If the tab is reloaded or closed while offline, or if the mobile operating system reclaims a background tab and suspends execution, unsent operations held in memory are lost; without persistent local storage they are not synchronised after reconnection. At an outdoor venue, connectivity is readily degraded inside temporary structures and by network congestion when the audience is dense, so this may lead to loss of patient information. The current design makes the state visible — the pending write is displayed, navigation is deferred and closing the browser raises a warning — but this improves detection rather than preservation.

**Concurrent editing of the same slot.** The editing dialogue holds the values present when it was opened, so if another device changes the same slot in the meantime, those changes are overwritten on save. Slots edited by different users do not conflict.

**Single point of failure.** The system depends entirely on the cloud database. A service outage or network congestion requires a switch to paper, and the criteria and procedure for that switch should be defined in advance.

**Quality assurance.** There is no automated testing, and each change is verified manually. Abnormal conditions, including loss of connectivity and concurrent access, have not been tested systematically before live use.

**Retention.** The audit log has no retention limit and will grow indefinitely with continued use. Archived records are read-only, so an end-of-day close performed in error can be undone only by manual intervention in the database console.

### Limitations

This is an observational study of a single event, and the comparator is the retrospective impression of the previous paper-based workflow at the same aid stations. It is not a prospective comparative trial and does not quantify any reduction in response time or improvement in the accuracy of shared information. Generalisability to other types of event (sporting events, marathons, religious gatherings) is limited. The user evaluation is subjective, the number of respondents is small, and bias cannot be excluded because the developers and the respondents belong to the same medical team. The interface is available only in Japanese.

## Future work

- Persistence of unsent operations, with automatic retransmission and conflict resolution on reconnection
- Documented criteria and procedure for reverting to paper during a communications failure (business continuity planning)
- Verification that requests originate from the genuine application
- Two-dimensional barcoding of the patient identifier to strengthen the link between the paper chart and the electronic record
- Automated testing, and load and failure testing
- A retention policy for the audit log, and a documented recovery procedure for archived records
- Assessment of whether serial vital signs should be recorded in the system
- Prospective study across several aid stations and events, quantifying any reduction in response time and improvement in the accuracy of shared information

## Conclusions

We implemented a browser-based real-time bed management application, together with user authentication, access control and audit logging, for the aid stations of a large outdoor music festival, and operated it alongside hand-written vital-sign records on paper charts. The system requires no installation and allows several aid stations to share information without a coordinator, but problems remain for live use: preservation of unsent operations offline, dependence on a single service, and consistency with the paper record. Further development addressing these problems, together with accumulated operational experience, is required to establish its value as an information platform for medical cover at mass gatherings.

---

## Acknowledgements

We thank the physicians, nurses and event staff who supported this work. The source code of the system is publicly available (https://github.com/Liptonist/monsterBash_bedControl).

## Disclosure

**Approval of the research protocol:** Approved by the research ethics committee of [institution] (reference: [number]).
**Informed consent:** [To be completed in accordance with the approved protocol.]
**Registry and registration number:** N/A.
**Animal studies:** N/A.
**Conflict of interest:** The authors declare no conflict of interest.

## Author contributions

[To be completed. For example — YS: study conception, system design and implementation, drafting of the manuscript; KY: clinical supervision, data collection; SK: supervision, critical revision. All authors approved the final version of the manuscript.]

---

## References

1. Milsten AM, Maguire BJ, Bissell RA, Seaman KG. Mass-gathering medical care: a review of the literature. Prehosp Disaster Med. 2002;17(3):151–162.
2. Bennett JF, Cottrell DJ. Glastonbury Festival: medical care at the world's largest greenfield music festival. Prehosp Disaster Med. 2024;39(2):170–177.
3. Arbon P. Mass-gathering medicine: a review of the evidence and future directions for research. Prehosp Disaster Med. 2007;22(2):131–135.
4. Ranse J, Hutton A. Minimum data set for mass-gathering health research and evaluation: a discussion paper. Prehosp Disaster Med. 2012;27(6):543–550.
5. Google. Firebase Realtime Database documentation. https://firebase.google.com/docs/database (accessed July 2026).
6. Google. Firebase Authentication documentation. https://firebase.google.com/docs/auth (accessed July 2026).
7. Google. Firebase Realtime Database security rules. https://firebase.google.com/docs/database/security (accessed July 2026).

> **[To be checked]** References 1–4 have been verified. A Japanese source for the definition of a mass gathering given in the Introduction would strengthen it. Reference style must be adjusted to the target journal's requirements.

---

## Table 1. Principal data nodes

| Node | Purpose | Principal fields |
|---|---|---|
| rooms/{0-3}/{beds｜chairsIn｜chairsOut}/{slot} | Current occupancy at each aid station | Slot identifier, patient identifier, triage category, name, age, sex, presenting complaint, time of admission, awaiting-escort flag |
| globalPatientId | Serial counter for patient identifiers (reset at the end-of-day close) | (counter) |
| festival | Festival year and day | year, day |
| discharged/{key} | Discharge records | Patient identifier, name, age, sex, presenting complaint, aid station, slot, triage category, admission and discharge times, length of stay |
| discharged_trash/{key} | Logically deleted discharge records | As above, plus time of deletion |
| archives/{year}-{day} | Records of a closed day (read-only) | Year, day, time archived, user who archived, counts, discharge records, recycle bin |
| auditLog/{key} | Audit log (append-only) | Time, user identifier, e-mail address, display name, operation, target, content |
| allowedUsers/{key} | Allow-list | Display name, administrator flag, sign-in method |

## Table 2. Questionnaire items (draft)

All items answered on a five-point Likert scale (1, strongly disagree; 2, disagree; 3, neither; 4, agree; 5, strongly agree).

**Respondent characteristics**
- F1. Number of times worked at these aid stations (first time / second / third or more)
- F2. Experience of the previous paper-only workflow (yes / no)
- F3. Aid station principally worked at
- F4. Device principally used (own smartphone / tablet / laptop)

**A. Comparison with the previous workflow (respondents answering "yes" to F2)**
- Q1. I could establish the availability of beds and chairs in my own aid station more quickly than before
- Q2. I could establish the availability at other aid stations more quickly than before
- Q3. I could locate the more severely unwell patients more easily than before
- Q4. Handover at a change of staff was easier than before
- Q5. The effort required for record-keeping was less than before
- Q6. Overall, I preferred working with the system to the previous workflow

**B. Features of the system**
- Q7. The screen showed the information I needed, without excess
- Q8. The colour-coding of triage category helped me understand the situation
- Q9. The display of time since admission (changing colour at 20 and 30 minutes) helped me manage periods of rest
- Q10. The "awaiting escort" flag helped in arranging patients' departure
- Q11. Transfer between slots and between aid stations matched how we actually work

**C. Operational obstacles**
- Q12. I could use the system without difficulty once it had been explained
- Q13. My work was not impeded by connectivity or by the responsiveness of the system
- Q14. The effort of signing in (receiving and entering an account) was acceptable
- Q15. Writing the patient identifier onto the paper chart was not burdensome
- Q16. I felt more confident about the handling of patient information than with the previous paper workflow

**D. Free text**
- Q17. What worked well
- Q18. What was difficult to use, and what should be improved
- Q19. Observations on using the paper chart alongside the system
- Q20. Any other comments

> **[Design rationale — delete before submission]** Q1–Q6 feed the discussion of the horizontal information-sharing structure; Q7–Q11 the design of the workflow; Q12–Q14 access control and the offline problem; Q15–Q16 the two-layer operation with the paper chart.

## Table 3. Questionnaire responses

[To be completed. For each item: number of responses, median (interquartile range), and proportion of favourable responses (4 or 5).]

---

## Figure legends

**Figure 1.** Overall architecture of the system. Devices at the four aid stations share a single cloud database (Firebase Realtime Database). Access from every device is controlled in three layers: user authentication, verification against a pre-registered allow-list, and privilege and sign-in-method checks. The database is organised by purpose (rooms/, current occupancy; discharged/, discharge records; archives/, records of closed days), and every write operation is logged automatically to auditLog/. All three checks are enforced server-side by the database security rules, not by the user interface.

**Figure 2.** Sequence of real-time synchronisation. When a physician registers or updates patient information at one aid station (STEP 1), the Realtime Database detects the change (STEP 2) and pushes the difference to every subscribed device (STEP 3). Unlike polling, the mechanism is event-driven over a persistent connection, so physicians at the other stations are continuously aware of bed availability and triage status without any additional operation. The time axis is schematic and shows the order of events, not measured latency; measured values are reported in the Results. A device that loses connectivity continues to display its local cache and re-synchronises automatically on reconnection. Patient identifiers are allocated by a server-side transaction, so concurrent registrations cannot receive the same number.

**Figure 3.** Clinical workflow for a single patient (A), the corresponding management screen (B, rendered in monochrome), and the consequences of operating the system compared with the previous paper-based workflow (C). Each patient passes through three stages: admission and triage, change of status or transfer, and discharge. The screen comprises tabs for switching between aid stations, a list of bed and chair states, and a visual representation of triage category; the same data can be viewed and edited from any device. The screen shown has been reduced and re-rendered in monochrome for print; in use, triage categories are shown as red, amber and green on a white background. Patient names are fictitious and shown for illustration only.
