angular.module('ui.bootstrap.editable', [])
    .constant('editableConfig', {
        blurToTimeout: 0,
        validators: {
            required: 'This field is required.',
            min: 'A minimum value of {{ value }} is required.',
            max: 'A maximum value of {{ value }} is allowed.',
            ngMinlength: 'A minimum length of {{ value }} is required.',
            ngMaxlength: 'A maximum length of {{ value }} is allowed.',
            email: 'A valid email address is required.',
            url: 'A valid URL is required.',
            number: 'A valid number is required.',
            defaultError: 'This is not a valid value.'
        },
        templateUrl: 'template/editable/editable.html',
        inputClass: 'input-medium',
        type: 'text',
        bindOn: 'click',
        selectLabel: 'label',
        groupBy: ''
    })
    .controller('EditableController', ['$scope', '$element', '$attrs', 'editableConfig', function ($scope, $element, $attrs, editableConfig) {
        $scope.opts = angular.extend({}, $scope.$eval($attrs.uiOptions || $attrs.editOptions || $attrs.options), editableConfig);

        // attribute options override non-attribute options
        $scope.opts.type = angular.isDefined($attrs.type) ? $attrs.type : $scope.opts.type;
        $scope.opts.templateUrl = angular.isDefined($attrs.templateUrl) ? $attrs.templateUrl : $scope.opts.templateUrl;
        $scope.opts.inputClass = angular.isDefined($attrs.inputClass) ? $attrs.inputClass : $scope.opts.inputClass;
        $scope.opts.bindOn = angular.isDefined($attrs.bindOn) ? $attrs.bindOn : $scope.opts.bindOn;
        $scope.opts.blurToTimeout = angular.isDefined($attrs.blurToTimeout) ? $attrs.blurToTimeout : $scope.opts.blurToTimeout;
        $scope.opts.groupBy = angular.isDefined($attrs.groupBy) ? $attrs.groupBy : $scope.opts.groupBy;
        $scope.opts.validators = angular.extend({}, $scope.opts.validators, $scope.opts.customValidators, $attrs.customValidators);


        // we need the attributes for editable-input as well
        $scope.attrs = $attrs;

        // the current state of the form
        $scope.isError = false;

        // if the binding isn't on click, we need to prevent the default click behavior
        if ($scope.opts.bindOn != 'click') {
            element.bind('click', function(e) {
                e.preventDefault();
            });
        }

        // changes from the non-isolate scope bubble down
        $scope.$watch('model', function() {
            $scope.$eval($attrs.ngModel + ' = model');
        });

        // changes from the isolate scope bubble up
        // NOTE: This BREAKS bindings from model to view (filters, watches on primitives etc)
        $scope.$watch($attrs.ngModel, function(val) {
            $scope.model = val;
        });

    }])
    .directive('editable', ['$compile', '$timeout', '$http', '$interpolate', '$templateCache', '$parse', 'editableConfig', function ($compile, $timeout, $http, $interpolate, $templateCache, $parse, editableConfig) {
        return {
            controller: 'EditableController',
            scope: {
                'model': '=ngModel',
                'source': '&'
            },
            link: function postLink(scope, element, attrs, ctrl) {
                var display = element.css('display'),
                    form,
                    error,
                    submit,
                    template,
                    errors,
                    elementText = angular.copy(element.text());
                    originalValue = angular.copy(scope.ngModel);


                // called by editableInput directive when the input has successfully replaced <editable-input>
                scope.inputReady = function() {
                    compileForm();
                    bindSubmit();
                };

                // displays the errors need to refactor some of this
                scope.showError = function() {
                    // reset the error values
                    errors = [];

                    // make sure the form field is defined
                    if (angular.isDefined(scope.editable_form.editable_field)) {
                        // loop through all editable_field errors
                        angular.forEach(scope.editable_form.editable_field.$error, function(key, value) {

                            // if error is true
                            if (key) {
                                // most validation fields don't have ng prefixes. But since ngMinlength and ngMaxlength do
                                // we have to check.
                                var camelValue = camelCase('ng-' + value);
                                var validator = scope.opts.validators[value] || scope.opts.validators[camelValue] || false;

                                // if validator is not falsy
                                if(validator) {
                                    // interpolate the value... this only works for min/max/minlength/maxlength or custom
                                    // it will return a null for any validator that doesn't have a {{ value }}
                                    var errorFunction = $interpolate(validator, true);
                                    var errorString;

                                    // if a function is returned
                                    if (angular.isFunction(errorFunction)) {
                                        // get the value for {{ value }} and replace it
                                        var replacementVal = attrs[value] || attrs[camelValue];
                                        errorString = errorFunction({ value: replacementVal });
                                    } else {
                                        // no interpolation required, just set string
                                        errorString = validator;
                                    }

                                    // push the error
                                    errors.push(errorString);
                                } else {
                                    // we don't have a validator for this (how?) push the default error
                                    errors.push(scope.opts.validators.defaultError);
                                }
                            }
                        });
                    }

                    // push each error into the error array
                    angular.forEach(errors, function(value, key) {
                        error.attr('tooltip-html-unsafe', value + "<br />");
                    });


                    // we remove submit/error buttons to the DOM depending on the error state
                    // this is because bootstrap messes with input-append type buttons if we don't
                    // however, as long as the error button is the first button in the template,
                    // this works fine
                    submit.after(error);
                    submit.remove();
                    // we have to compile the error since it
                    // isn't added to the DOM until an error occurs
                    $compile(error)(scope);
                    scope.$apply();

                    // prevents constant calling of showError
                    scope.isError = true;

                };

                // undoes showError
                scope.hideError = function() {
                    error.after(submit);
                    error.remove();

                    // we have to rebind the submit button since it was removed from the DOM
                    bindSubmit();
                    scope.isError = false;
                };

                // submits the form if it's valid, shows error otherwise
                scope.submitForm = function() {
                    if (scope.editable_form.$invalid) {
                        // we should get here effectively never
                        scope.showError();
                    } else {
                        form.remove();
                        showElement();
                        scope.$apply();
                    }
                };

                // cancels the form and sets the viewValue back to the originalValue
                scope.cancelForm = function() {
                    //ctrl.$setViewValue(originalValue);
                    form.remove();
                    showElement();
                };

                var getTemplate = function() {
                    // bind the element

                    $http.get(scope.opts.templateUrl, {cache: $templateCache})
                        .success(function(result) {
                            template = result;

                            element.bind(scope.opts.bindOn, function(e) {
                                e.preventDefault();

                                hideElement();
                                buildForm();
                            });
                        });
                };

                // hides the element
                var hideElement = function() {
                    element.css('display', 'none');
                };

                // shows the element
                var showElement = function() {
                    element.css('display', 'inline');
                };

                // grabs the form, error and submit buttons
                // error button must be first
                // submit button must be directly after it.
                // we don't do hasClass checks (or anything like it)
                // so that this directive works as is for Foundation, Bootstrap 3+ and 2+
                var buildForm = function() {
                    form = angular.element(template);

                    error = form.find('button').eq(0);
                    submit = form.find('button').eq(1);

                    error.remove();

                    element.after(form);

                    // we have to compile the editable input first,
                    // or the form invalidation won't work
                    $compile(form.find('editable-input'))(scope);
                };

                // compiles complete form against current scope
                var compileForm = function() {
                    scope.$apply(function() {
                        $compile(form)(scope);
                    });
                };

                // binds the submit button to submitForm
                var bindSubmit = function() {
                    submit.bind('click', function(e) {
                        scope.submitForm();
                    });
                };

                // taken directly from Angular.js
                // converts snake-case to camelCase
                var camelCase = function(name) {
                  return name.
                    replace(/([\:\-\_]+(.))/g, function(_, separator, letter, offset) {
                      return offset ? letter.toUpperCase() : letter;
                    }).
                    replace(/^moz([A-Z])/, 'Moz$1');
                };

                // start it off
                getTemplate();
            }
        };
    }])
    .directive('editableInput', ['$compile', function ($compile) {
        return {
            restrict: 'E',
            link: function postLink(scope, element, attrs) {
                // scope.source
                // scope.ngModel
                var input,
                    optionsAttr,
                    groupBy = '',
                    templates = {
                    text: '<input name="editable_field" type="{{ opts.type }}" class="{{ opts.inputClass }}">',
                    select: '<select name="editable_field" class="{{ opts.inputClass }}"></select>'
                };

                // build the template based on type
                var buildEditable = function() {
                    if (scope.opts.type == 'select'){
                        input = angular.element(templates.select);
                        buildSelect();
                    } else {
                        input = angular.element(templates.text);
                        addInputBindings();
                    }

                    addInputAttributes();
                    blurTimeout();

                    element.replaceWith(input);
                    scope.$apply();

                    // we call this so the entire editable can be compiled
                    // otherwise the form validation (the field isn't attached to scope.form_name).
                    scope.inputReady();
                };

                // builds the ngOptions attribute for a select
                var buildSelect = function() {
                    if (scope.opts.groupBy !== '') {
                        groupBy = ' group by value.' + scope.opts.groupBy;
                    }

                    if (angular.isArray(scope.source()) && angular.isObject(scope.source()[0])) {
                        optionsAttr = 'value.' + scope.opts.selectLabel + ' as value.label' + groupBy + ' for (key, value) in source()';
                    } else  {
                        optionsAttr = 'value for value in source()';
                    }

                    input.attr('ng-options', optionsAttr);
                };

                // bindings for non-select input types
                //
                var addInputBindings = function() {
                    input.bind('keydown', function(e) {
                        // enter key
                        if (e.keyCode == 13) {
                            scope.submitForm();
                        // escape key
                        } else if (e.keyCode == 27) {
                            scope.cancelForm();
                        }
                    });

                    input.bind('keyup', function(e) {
                        // validate the input on keyup
                        if (scope.editable_form.$invalid) {
                            // we may already be showing an error
                            if (!scope.isError) {
                                scope.showError();
                            }
                        } else {
                            // it's valid, if isError is true, undo it
                            if (scope.isError) {
                                scope.hideError();
                            }
                        }
                    });
                };

                // adds the input attributes per scope.opts.validators
                var addInputAttributes = function() {

                    angular.forEach(scope.attrs, function(value, key) {
                        if (angular.isDefined(scope.opts.validators[key])) {
                            input.attr(snakeCase(key), scope.attrs[key]);
                        }
                    });

                    input.attr('ng-model', 'model');
                };

                // handles the timeout if blurTimeout is above 0 (default)
                var blurTimeout = function() {
                    if (scope.opts.blurToTimeout > 0) {
                        input.bind('blur', function(e) {
                            var selectTimeout = $timeout(function() {
                                scope.cancelForm();
                            }, scope.opts.blurToTimeout);

                            input.bind('focus', function(e) {
                                $timeout.cancel(selectTimeout);
                            });
                        });
                    }
                };

                // taken directly from Angular.
                // converts camelCase to snake-case
                var snakeCase = function(name, separator) {
                    separator = separator || '_';
                        return name.replace(/[A-Z]/g, function(letter, pos) {
                        return (pos ? separator : '') + letter.toLowerCase();
                    });
                };

                // start it!
                buildEditable();
            }
        };
    }]);