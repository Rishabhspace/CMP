// script.js
function confirmDelete() {
  return confirm("Are you sure you want to delete this conference?");
}

function formatDate(dateString) {
  const options = { day: "2-digit", month: "2-digit", year: "numeric" };
  const formattedDate = new Date(dateString).toLocaleDateString(
    "en-GB",
    options
  );
  return formattedDate.split("/").join("-");
}

function updateStatus(newStatus) {
  // const userId = ;

  // Send a POST request to the server to update the status
  $.ajax({
    url: `/updateStatus/${userId}`,
    method: "POST",
    contentType: "application/json",
    data: JSON.stringify({ newStatus: newStatus }),
    success: function (response) {
      console.log(response.message);
      // Handle success, update UI, etc.
    },
    error: function (error) {
      console.error(error.responseJSON.message);
      // Handle error, show error message, etc.
    },
  });
}

function validateForm() {
  var fileInput = document.getElementById("myFile");
  var allowedTypes = ["application/pdf"];
  var maxFileSize = 10 * 1024 * 1024; // 10 MB

  if (fileInput.files.length > 0) {
    var fileType = fileInput.files[0].type;
    var fileSize = fileInput.files[0].size;

    if (allowedTypes.indexOf(fileType) === -1) {
      alert("Please select a PDF file.");
      return false;
    }

    if (fileSize > maxFileSize) {
      alert("File size exceeds the maximum limit of 10 MB.");
      return false;
    }
  }

  return true; // Continue with form submission
}
