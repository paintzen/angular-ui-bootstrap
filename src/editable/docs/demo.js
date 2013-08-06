var EditableDemoCtrl = function ($scope) {

  $scope.editableText = 'editable';
  $scope.editableArray = 'editable';
  $scope.editableObject = 'editable';

  $scope.arrayOpts = ['editable', 'sweet', 'nice'];

  $scope.objectOpts = [{
    label: 'editable',
    someOtherStuff: 'neat!'
  },{    
    label: 'sweet',
    someOtherStuff: 'neat!'
  },{
    label: 'nice',
    someOtherStuff: 'neat!'
  }];

};