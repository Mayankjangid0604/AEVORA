# AEVORA V12 — World-State & Event Specification

## Purpose
Project authoritative Aevora state into persistent spatial entities without creating new business truth.

## World entities
WorldCompany, WorldCampus, WorldBuilding, WorldDepartment, WorldTeam, WorldPerson, WorldVehicle, WorldProject, WorldMeeting, WorldLocation, WorldTravel, WorldObject, WorldEnvironment, WorldEvent.

These are representations, not replacement business records.

## Event flow
Aevora authoritative event → World-State Gateway → relevant world subscriptions → simulation → renderer.

## Enterprise events
Examples: CompanyCreated, EmployeeHired, EmployeeTransferred, DepartmentCreated, TaskAssigned, ProjectUpdated, MeetingStarted, MeetingEnded, LeadershipChanged, VehicleAssigned.

## Interaction events
Examples: user selects person/building; user requests travel; user requests meeting; user issues voice command. These become enterprise actions only after existing authorization/business validation.

## Requirements
Events must support ordering, timestamps, versions, idempotency, correlation IDs, replay, missed-event recovery and reconciliation.

## Prohibition
V12 must not invent business events merely to animate the world.
