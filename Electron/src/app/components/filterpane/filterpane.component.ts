import { Component, OnInit, OnDestroy } from '@angular/core';
import { EventLogService, FilterEventsAction, EventFilter, getFilterFunction, FocusEventAction } from '../../providers/eventlog.service';
import { takeUntil, distinctUntilChanged, take, map } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { FormGroup, AbstractControl, FormControl } from '@angular/forms';

@Component({
  selector: 'app-filterpane',
  templateUrl: './filterpane.component.html',
  styleUrls: ['./filterpane.component.scss']
})
export class FilterPaneComponent implements OnInit, OnDestroy {

  ngUnsubscribe$ = new Subject<void>();
  allLevels = ['Information', 'Warning', 'Error'];
  form: FormGroup;
  ids: FormGroup;
  sources: FormGroup;
  tasks: FormGroup;
  levels: FormGroup;
  description: FormGroup;
  recentFilters: { filter: string, readableFilter: string }[];

  constructor(public eventLogService: EventLogService) {
    const savedFiltersString = localStorage.getItem('savedFilters');
    if (savedFiltersString) {
      this.recentFilters = JSON.parse(savedFiltersString);
      this.recentFilters.unshift(null);
    } else {
      this.recentFilters = [];
    }
  }

  get sourcesFilter() {
    return this.eventLogService.state$.pipe(map(s => {
      if (this.sources.pristine) {
        return s.filter || s.filter.sources;
      }
    }));
  }

  get tasksFilter() {
    return this.eventLogService.state$.pipe(map(s => {
      if (this.tasks.pristine) {
        return s.filter || s.filter.tasks;
      }
    }));
  }

  get idsFilter() {
    return this.eventLogService.state$.pipe(map(s => {
      if (this.ids.pristine) {
        return s.filter || s.filter.ids;
      }
    }));
  }

  get levelsFilter() {
    return this.eventLogService.state$.pipe(map(s => {
      if (this.levels.pristine) {
        return s.filter || s.filter.levels;
      }
    }));
  }

  get descriptionFilter() {
    return this.eventLogService.state$.pipe(map(s => {
      if (this.description.pristine) {
        return s.filter || s.filter.description;
      }
    }));
  }

  applyFilter(filter: EventFilter) {

    // If we're clearing the filter, then handle it and return
    if (filter === null) {
      if (this.recentFilters.length > 0 && this.recentFilters[0] !== null) {
        this.recentFilters.unshift(null);
      }
      this.eventLogService
        .actions$
        .next(new FilterEventsAction({ description: null, ids: null, levels: null, sources: null, tasks: null }));
      return;
    }

    // Otherwise, we're setting a filter
    this.addToRecentFilters(filter, true); // True indicates we're applying it

    localStorage.setItem('savedFilters', JSON.stringify(this.recentFilters));

    this.eventLogService.actions$.next(new FilterEventsAction(filter));
  }

  private addToRecentFilters(filter: EventFilter, isApplied: boolean) {
    const readableFilter = this.stringifyFilter(filter, true);
    const unreadableFilter = this.stringifyFilter(filter, false);
    const filterIndex = this.recentFilters.findIndex(f => f && f.readableFilter === readableFilter);
    const filterToAdd = { filter: unreadableFilter, readableFilter: readableFilter };

    // If the filter is being applied, make sure it's first in the array.
    // If the filter is not be applied, and is already in there, then don't do anything.
    // If the filter is not being applied, and is not in there, add it at position 1.

    if (isApplied) {
      if (filterIndex > -1) {
        this.recentFilters.splice(filterIndex, 1);
      }

      if (this.recentFilters[0] === null) {
        this.recentFilters[0] = filterToAdd;
      } else {
        this.recentFilters.unshift(filterToAdd);
      }
    } else {
      if (filterIndex === -1) {
        this.recentFilters.splice(1, 0, filterToAdd);
      }
    }

    this.recentFilters = this.recentFilters.slice(0, this.recentFilters[0] === null ? 9 : 8);
  }

  applyCurrentFilter() {
    const filter: EventFilter = this.getFormFilter();
    this.applyFilter(filter);
  }

  applySavedFilter(filterString: string) {
    const filter = this.unstringifyFilter(filterString);
    this.applyFilter(filter);
  }

  findNext(filterString: string) {
    const filter = filterString ? this.unstringifyFilter(filterString) : this.getFormFilter();
    this.addToRecentFilters(filter, false);
    const func = getFilterFunction(filter, this.eventLogService);
    this.eventLogService.state$.pipe(take(1)).subscribe(s => {
      const startIndex = s.focusedEvent ? s.recordsFiltered.indexOf(s.focusedEvent) + 1 : 0;
      for (let i = startIndex; i < s.recordsFiltered.length; i++) {
        if (func(s.recordsFiltered[i])) {
          this.eventLogService.actions$.next(new FocusEventAction(s.recordsFiltered[i]));
          break;
        }
      }
    });
  }

  findPrevious(filterString: string) {
    const filter = filterString ? this.unstringifyFilter(filterString) : this.getFormFilter();
    this.addToRecentFilters(filter, false);
    const func = getFilterFunction(filter, this.eventLogService);
    this.eventLogService.state$.pipe(take(1)).subscribe(s => {
      const startIndex = s.focusedEvent ? s.recordsFiltered.indexOf(s.focusedEvent) - 1 : 0;
      for (let i = startIndex; i >= 0; i--) {
        if (func(s.recordsFiltered[i])) {
          this.eventLogService.actions$.next(new FocusEventAction(s.recordsFiltered[i]));
          break;
        }
      }
    });
  }

  private getFormFilter() {
    const allIds = Object.getOwnPropertyNames(this.form.value.ids);
    const idsNotSelected = allIds.filter(i => this.form.value.ids[i] === false);
    const idFilter = idsNotSelected.length === 0 ? null :
      new Set<number>(allIds.filter(i => this.form.value.ids[i] === true).map(i => parseInt(i, 10)));

    const allProviders = Object.getOwnPropertyNames(this.form.value.sources);
    const providersNotSelected = allProviders.filter(i => this.form.value.sources[i] === false);
    const providerFilter = providersNotSelected.length === 0 ? null :
      new Set<string>(allProviders.filter(i => this.form.value.sources[i] === true));

    const allTasks = Object.getOwnPropertyNames(this.form.value.tasks);
    const tasksNotSelected = allTasks.filter(i => this.form.value.tasks[i] === false);
    const taskFilter = tasksNotSelected.length === 0 ? null :
      new Set<string>(allTasks.filter(i => this.form.value.tasks[i] === true));

    const levelsNotSelected = this.allLevels.filter(i => this.form.value.levels[i] === false);
    const levelFilter = levelsNotSelected.length === 0 ? null :
      new Set<string>(this.allLevels.filter(i => this.form.value.levels[i] === true));

    const filter: EventFilter = {
      ids: idFilter,
      sources: providerFilter,
      tasks: taskFilter,
      levels: levelFilter,
      description: {
        text: this.description.controls.Description.value,
        negate: this.description.controls['Not match'].value,
        includeXml: this.description.controls['Include Xml'].value
      }
    };

    return filter;
  }

  ngOnDestroy() {
    this.ngUnsubscribe$.next();
  }

  ngOnInit() {
    this.eventLogService.state$.pipe(takeUntil(this.ngUnsubscribe$), distinctUntilChanged()).subscribe(s => {
      const ids: { [key: string]: AbstractControl } = {};
      s.uniqueRecordValues.id.forEach(i => {
        const isIncludedInFilter = !s.filter || !s.filter.ids || s.filter.ids.has(i);
        ids[`${i}`] = new FormControl(isIncludedInFilter);
      });
      this.ids = new FormGroup(ids);

      const sources: { [key: string]: AbstractControl } = {};
      s.uniqueRecordValues.providerName.forEach(i => {
        const isIncludedInFilter = !s.filter || !s.filter.sources || s.filter.sources.has(i);
        sources[`${i}`] = new FormControl(isIncludedInFilter);
      });
      this.sources = new FormGroup(sources);

      const tasks: { [key: string]: AbstractControl } = {};
      s.uniqueRecordValues.taskName.forEach(i => {
        const isIncludedInFilter = !s.filter || !s.filter.tasks || s.filter.tasks.has(i);
        tasks[`${i}`] = new FormControl(isIncludedInFilter);
      });
      this.tasks = new FormGroup(tasks);

      const levels: { [key: string]: AbstractControl } = {};
      levels['Information'] = new FormControl(!s.filter || !s.filter.levels || s.filter.levels.has('Information'));
      levels['Warning'] = new FormControl(!s.filter || !s.filter.levels || s.filter.levels.has('Warning'));
      levels['Error'] = new FormControl(!s.filter || !s.filter.levels || s.filter.levels.has('Error'));
      this.levels = new FormGroup(levels);

      this.description = new FormGroup(
        {
          Description: new FormControl(s.filter && s.filter.description ? s.filter.description.text : ''),
          'Not match': new FormControl(s.filter && s.filter.description ? s.filter.description.negate : false),
          'Include Xml': new FormControl(s.filter && s.filter.description ? s.filter.description.includeXml : false)
        }
      );

      this.form = new FormGroup({
        ids: this.ids,
        sources: this.sources,
        tasks: this.tasks,
        levels: this.levels,
        description: this.description
      });
    });
  }

  resetFilter() {
    this.applyFilter(null);
  }

  /**
   * Because an EventFilter contains Sets, we cannot just use JSON.stringify.
   * @param filter The EventFilter to stringify
   * @param indentation Whether to use indentation to make it readable
   */
  stringifyFilter(filter: EventFilter, indentation: boolean): string {
    const slimFilter = {};
    if (filter.description && filter.description.text) {
      slimFilter['description'] = filter.description;
    }
    if (filter.ids && filter.ids.size > 0) {
      slimFilter['ids'] = Array.from(filter.ids);
    }
    if (filter.levels && filter.levels.size > 0) {
      slimFilter['levels'] = Array.from(filter.levels);
    }
    if (filter.sources) {
      slimFilter['sources'] = Array.from(filter.sources);
    }
    if (filter.tasks) {
      slimFilter['tasks'] = Array.from(filter.tasks);
    }

    if (indentation) {
      return JSON.stringify(slimFilter, null, 4);
    } else {
      return JSON.stringify(slimFilter);
    }
  }

  unstringifyFilter(s: string): EventFilter {
    const strObj = JSON.parse(s);
    return {
      description: strObj['description'] ?
        (typeof (strObj['description']) === 'string' ?     // If it's a string then convert
          { text: strObj['description'], negate: false } :  // from the old format
          strObj['description']) : null,
      ids: strObj['ids'] ? new Set(strObj['ids']) : null,
      levels: strObj['levels'] ? new Set(strObj['levels']) : null,
      sources: strObj['sources'] ? new Set(strObj['sources']) : null,
      tasks: strObj['tasks'] ? new Set(strObj['tasks']) : null
    };
  }

}
